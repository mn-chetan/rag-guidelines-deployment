"""Admin module for managing URLs and scheduled re-crawling."""
import json
import hashlib
import logging
import asyncio
import uuid
import fcntl
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Tuple
from google.cloud import storage
from config import settings

logger = logging.getLogger(__name__)
CONFIG_PATH = "config/managed_urls.json"
PROMPT_CONFIG_PATH = "config/prompt_config.json"
JOB_LOCK_FILE = "/tmp/recrawl_job.lock"

# In-memory job state (for tracking ongoing bulk operations)
current_job_state: Dict[str, Any] = {}


def get_storage_client():
    """Get or create storage client."""
    return storage.Client()


def compute_content_hash(content: str) -> str:
    """Compute SHA256 hash of content for change detection."""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()


def load_managed_urls() -> Dict[str, Any]:
    """Load managed URLs configuration from GCS."""
    try:
        client = get_storage_client()
        bucket = client.bucket(settings.GCS_BUCKET)
        blob = bucket.blob(CONFIG_PATH)
        
        if not blob.exists():
            logger.info("Config file doesn't exist, returning default")
            return get_default_config()
        
        content = blob.download_as_string()
        config = json.loads(content)
        logger.info(f"Loaded config with {len(config.get('urls', []))} URLs")
        return config
    except Exception as e:
        logger.error(f"Failed to load config from GCS: {e}")
        return get_default_config()


def save_managed_urls(config: Dict[str, Any]) -> bool:
    """Save managed URLs configuration to GCS."""
    try:
        client = get_storage_client()
        bucket = client.bucket(settings.GCS_BUCKET)
        blob = bucket.blob(CONFIG_PATH)
        
        content = json.dumps(config, indent=2, default=str)
        blob.upload_from_string(content, content_type="application/json")
        
        logger.info(f"Saved config with {len(config.get('urls', []))} URLs")
        return True
    except Exception as e:
        logger.error(f"Failed to save config to GCS: {e}")
        return False


def get_default_config() -> Dict[str, Any]:
    """Return default configuration with initial URLs."""
    return {
        "urls": [
            {
                "id": "url-001",
                "name": "Pay with UPI Lite on Google Pay",
                "url": "https://support.google.com/pay/india/answer/13327133?hl=en&ref_topic=10094979&sjid=12448957856790378883-NC",
                "added_at": "2025-12-04T00:00:00Z",
                "last_indexed_at": None,
                "last_index_status": "pending",
                "last_error": None,
                "content_hash": None,
                "enabled": True
            },
            {
                "id": "url-002",
                "name": "Join YouTube Premium",
                "url": "https://support.google.com/youtube/answer/16475192?hl=en&ref_topic=9257430&sjid=12448957856790378883-NC&visit_id=639004339077561929-1512570881&rd=1",
                "added_at": "2025-12-04T00:00:00Z",
                "last_indexed_at": None,
                "last_index_status": "pending",
                "last_error": None,
                "content_hash": None,
                "enabled": True
            },
            {
                "id": "url-003",
                "name": "Fish",
                "url": "https://en.wikipedia.org/wiki/Fish",
                "added_at": "2025-12-04T00:00:00Z",
                "last_indexed_at": None,
                "last_index_status": "pending",
                "last_error": None,
                "content_hash": None,
                "enabled": True
            }
        ],
        "schedule": {
            "enabled": True,
            "interval_hours": 24,
            "last_run_at": None,
            "next_run_at": None
        },
        "current_job": None,
        "last_import": None
    }


def initialize_config_if_needed():
    """Initialize the config file in GCS if it doesn't exist."""
    try:
        client = get_storage_client()
        bucket = client.bucket(settings.GCS_BUCKET)
        blob = bucket.blob(CONFIG_PATH)
        
        if not blob.exists():
            logger.info("Initializing config file in GCS")
            config = get_default_config()
            save_managed_urls(config)
            return True
        return False
    except Exception as e:
        logger.error(f"Failed to initialize config: {e}")
        return False


def add_url(name: str, url: str) -> Dict[str, Any]:
    """Add a new URL to the managed list."""
    config = load_managed_urls()
    
    # Check for duplicate URL
    for existing in config["urls"]:
        if existing["url"] == url:
            raise ValueError(f"URL already exists: {url}")
    
    new_url = {
        "id": f"url-{uuid.uuid4().hex[:8]}",
        "name": name,
        "url": url,
        "added_at": datetime.utcnow().isoformat() + "Z",
        "last_indexed_at": None,
        "last_index_status": "pending",
        "last_error": None,
        "content_hash": None,
        "enabled": True
    }
    
    config["urls"].append(new_url)
    save_managed_urls(config)
    
    return new_url


def remove_url(url_id: str) -> bool:
    """Remove a URL from the managed list."""
    config = load_managed_urls()
    
    original_count = len(config["urls"])
    config["urls"] = [u for u in config["urls"] if u["id"] != url_id]
    
    if len(config["urls"]) == original_count:
        return False  # URL not found
    
    save_managed_urls(config)
    return True


def update_url_status(url_id: str, status: str, error: Optional[str] = None, 
                      content_hash: Optional[str] = None) -> bool:
    """Update the status of a specific URL after indexing."""
    config = load_managed_urls()
    
    for url_entry in config["urls"]:
        if url_entry["id"] == url_id:
            url_entry["last_index_status"] = status
            url_entry["last_error"] = error
            if status == "success":
                url_entry["last_indexed_at"] = datetime.utcnow().isoformat() + "Z"
            if content_hash:
                url_entry["content_hash"] = content_hash
            save_managed_urls(config)
            return True
    
    return False


def update_schedule(enabled: Optional[bool] = None, interval_hours: Optional[int] = None) -> Dict[str, Any]:
    """Update schedule configuration."""
    config = load_managed_urls()
    
    if enabled is not None:
        config["schedule"]["enabled"] = enabled
    
    if interval_hours is not None:
        config["schedule"]["interval_hours"] = interval_hours
    
    # Recalculate next run time if we have a last run
    if config["schedule"]["last_run_at"] and config["schedule"]["enabled"]:
        last_run = datetime.fromisoformat(config["schedule"]["last_run_at"].replace("Z", "+00:00"))
        next_run = last_run + timedelta(hours=config["schedule"]["interval_hours"])
        config["schedule"]["next_run_at"] = next_run.isoformat().replace("+00:00", "Z")
    
    save_managed_urls(config)
    return config["schedule"]


def start_job_atomic(job_type: str, url_ids: List[str]) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Atomically check if a job is running and start a new one if not.
    Uses file locking to prevent race conditions.

    Returns:
        Tuple of (success, job_id, error_message)
    """
    global current_job_state

    try:
        # Create lock file if it doesn't exist
        lock_fd = os.open(JOB_LOCK_FILE, os.O_CREAT | os.O_RDWR)

        try:
            # Try to acquire exclusive lock (non-blocking)
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)

            # Check if job is already running (from GCS state)
            current = get_job_status()
            if current and current.get("status") == "running":
                os.close(lock_fd)
                return False, None, f"A job is already running: {current.get('job_id')}"

            # Start new job
            job_id = f"job-{uuid.uuid4().hex[:8]}"

            current_job_state = {
                "job_id": job_id,
                "type": job_type,
                "status": "running",
                "started_at": datetime.utcnow().isoformat() + "Z",
                "total_urls": len(url_ids),
                "processed_urls": 0,
                "successful_urls": 0,
                "failed_urls": 0,
                "skipped_urls": 0,
                "current_url": None,
                "current_url_name": None,
                "errors": [],
                "completed_at": None
            }

            # Save to GCS config
            config = load_managed_urls()
            config["current_job"] = current_job_state.copy()
            save_managed_urls(config)

            # Release lock
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
            os.close(lock_fd)

            return True, job_id, None

        except BlockingIOError:
            # Another process has the lock
            os.close(lock_fd)
            return False, None, "Another job operation is in progress"

    except Exception as e:
        logger.error(f"Failed to start job atomically: {e}")
        return False, None, str(e)


def start_job(job_type: str, url_ids: List[str]) -> str:
    """Start a new indexing job and return job ID. (Legacy - use start_job_atomic for new code)"""
    global current_job_state

    job_id = f"job-{uuid.uuid4().hex[:8]}"

    current_job_state = {
        "job_id": job_id,
        "type": job_type,
        "status": "running",
        "started_at": datetime.utcnow().isoformat() + "Z",
        "total_urls": len(url_ids),
        "processed_urls": 0,
        "successful_urls": 0,
        "failed_urls": 0,
        "skipped_urls": 0,
        "current_url": None,
        "current_url_name": None,
        "errors": [],
        "completed_at": None
    }

    # Also save to GCS config
    config = load_managed_urls()
    config["current_job"] = current_job_state.copy()
    save_managed_urls(config)

    return job_id


def update_job_progress(current_url: str, current_url_name: str, processed: int, 
                        successful: int, failed: int, skipped: int, 
                        error: Optional[str] = None):
    """Update job progress."""
    global current_job_state
    
    current_job_state["current_url"] = current_url
    current_job_state["current_url_name"] = current_url_name
    current_job_state["processed_urls"] = processed
    current_job_state["successful_urls"] = successful
    current_job_state["failed_urls"] = failed
    current_job_state["skipped_urls"] = skipped
    
    if error:
        current_job_state["errors"].append({
            "url": current_url,
            "error": error,
            "time": datetime.utcnow().isoformat() + "Z"
        })
    
    # Save to GCS periodically
    config = load_managed_urls()
    config["current_job"] = current_job_state.copy()
    save_managed_urls(config)


def complete_job(status: str = "completed"):
    """Mark the current job as complete."""
    global current_job_state
    
    current_job_state["status"] = status
    current_job_state["completed_at"] = datetime.utcnow().isoformat() + "Z"
    current_job_state["current_url"] = None
    current_job_state["current_url_name"] = None
    
    # Save to GCS
    config = load_managed_urls()
    config["current_job"] = current_job_state.copy()
    
    # Update schedule last run time
    config["schedule"]["last_run_at"] = datetime.utcnow().isoformat() + "Z"
    if config["schedule"]["enabled"]:
        next_run = datetime.utcnow() + timedelta(hours=config["schedule"]["interval_hours"])
        config["schedule"]["next_run_at"] = next_run.isoformat() + "Z"
    
    save_managed_urls(config)


def get_job_status() -> Optional[Dict[str, Any]]:
    """Get current job status."""
    global current_job_state
    
    if current_job_state:
        return current_job_state.copy()
    
    # Try loading from GCS if no in-memory state
    config = load_managed_urls()
    return config.get("current_job")


def update_import_status(operation_name: str, status: str, 
                         completed_at: Optional[str] = None):
    """Update the last import operation status."""
    config = load_managed_urls()
    
    config["last_import"] = {
        "operation_name": operation_name,
        "status": status,
        "started_at": datetime.utcnow().isoformat() + "Z" if status == "started" else config.get("last_import", {}).get("started_at"),
        "completed_at": completed_at
    }
    
    save_managed_urls(config)


# ==================== PROMPT CONFIGURATION ====================

def get_default_prompt_config() -> Dict[str, Any]:
    """Return default prompt configuration with original hardcoded prompts."""
    return {
        "active_prompt": {
            "id": "default",
            "name": "Default Prompt",
            "template": """You are the Guideline Assistant for media auditors. Your job is to give QUICK, CLEAR answers.

CONTEXT:
{{context}}

QUESTION: {{query}}

RESPOND IN THIS EXACT FORMAT:

**Verdict**: [Flag / Don't Flag / Needs Review]

**Why**:
- [State the specific guideline rule that applies]
- [Explain how the content violates/complies with that rule]

**Guideline Reference**: [Which guideline section]

**Related Questions**:
- [Suggest a relevant follow-up question the auditor might ask]
- [Suggest another related question about edge cases or variations]
- [Suggest a question about a related guideline topic]

RULES:
- Lead with the verdict — auditors need fast answers
- ALWAYS connect your reasoning to the specific guideline text
- Be CONFIDENT. If guidelines cover a category (e.g., "weapons"), apply it clearly
- Make the logical connection explicit: "The guideline prohibits X, and this content shows Y, therefore..."
- Only say "Needs Review" if the guidelines genuinely don't cover this category
- Keep it under 100 words unless complexity requires more
- Use bullet points, not paragraphs
- The Related Questions should be natural follow-ups an auditor would ask""",
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "updated_by": "system",
            "version": 1
        },
        "history": [],
        "defaults": {
            "template": """You are the Guideline Assistant for media auditors. Your job is to give QUICK, CLEAR answers.

CONTEXT:
{{context}}

QUESTION: {{query}}

RESPOND IN THIS EXACT FORMAT:

**Verdict**: [Flag / Don't Flag / Needs Review]

**Why**:
- [State the specific guideline rule that applies]
- [Explain how the content violates/complies with that rule]

**Guideline Reference**: [Which guideline section]

**Related Questions**:
- [Suggest a relevant follow-up question the auditor might ask]
- [Suggest another related question about edge cases or variations]
- [Suggest a question about a related guideline topic]

RULES:
- Lead with the verdict — auditors need fast answers
- ALWAYS connect your reasoning to the specific guideline text
- Be CONFIDENT. If guidelines cover a category (e.g., "weapons"), apply it clearly
- Make the logical connection explicit: "The guideline prohibits X, and this content shows Y, therefore..."
- Only say "Needs Review" if the guidelines genuinely don't cover this category
- Keep it under 100 words unless complexity requires more
- Use bullet points, not paragraphs
- The Related Questions should be natural follow-ups an auditor would ask"""
        }
    }


def validate_prompt_template(template: str) -> tuple[bool, Optional[str]]:
    """
    Validate prompt template.
    
    Returns:
        (is_valid, error_message)
    """
    if not template or not template.strip():
        return False, "Prompt cannot be empty"
    
    if len(template) < 50:
        return False, "Prompt is too short (minimum 50 characters)"
    
    if len(template) > 10000:
        return False, "Prompt exceeds maximum length of 10,000 characters"
    
    if "{{query}}" not in template:
        return False, "Prompt must include {{query}} variable"
    
    if "{{context}}" not in template:
        return False, "Prompt must include {{context}} variable"
    
    return True, None


def load_prompt_config() -> Dict[str, Any]:
    """Load prompt configuration from GCS."""
    try:
        client = get_storage_client()
        bucket = client.bucket(settings.GCS_BUCKET)
        blob = bucket.blob(PROMPT_CONFIG_PATH)
        
        if not blob.exists():
            logger.info("Prompt config doesn't exist, returning default")
            return get_default_prompt_config()
        
        content = blob.download_as_string()
        config = json.loads(content)
        logger.info("Loaded prompt config")
        return config
    except Exception as e:
        logger.error(f"Failed to load prompt config from GCS: {e}")
        return get_default_prompt_config()


def save_prompt_config(config: Dict[str, Any]) -> bool:
    """Save prompt configuration to GCS."""
    try:
        client = get_storage_client()
        bucket = client.bucket(settings.GCS_BUCKET)
        blob = bucket.blob(PROMPT_CONFIG_PATH)
        
        content = json.dumps(config, indent=2, default=str)
        blob.upload_from_string(content, content_type="application/json")
        
        logger.info("Saved prompt config")
        return True
    except Exception as e:
        logger.error(f"Failed to save prompt config to GCS: {e}")
        return False


def add_prompt_to_history(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Add current active prompt to history before updating.
    Keep only last 10 versions.
    """
    if "active_prompt" in config:
        history_entry = config["active_prompt"].copy()
        config["history"].insert(0, history_entry)
        
        # Keep only last 10 versions
        config["history"] = config["history"][:10]
    
    return config


def update_prompt(template: str, updated_by: str = "admin") -> tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Update the active prompt template.
    
    Returns:
        (success, error_message, updated_config)
    """
    # Validate template
    is_valid, error = validate_prompt_template(template)
    if not is_valid:
        return False, error, None
    
    # Load current config
    config = load_prompt_config()
    
    # Add current to history
    config = add_prompt_to_history(config)
    
    # Update active prompt
    config["active_prompt"]["template"] = template
    config["active_prompt"]["updated_at"] = datetime.utcnow().isoformat() + "Z"
    config["active_prompt"]["updated_by"] = updated_by
    config["active_prompt"]["version"] = config["active_prompt"].get("version", 0) + 1
    
    # Save
    if save_prompt_config(config):
        return True, None, config
    else:
        return False, "Failed to save configuration", None


def reset_prompt_to_default() -> tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """Reset prompt to default configuration."""
    config = load_prompt_config()
    
    # Add current to history before resetting
    config = add_prompt_to_history(config)
    
    # Reset to default
    default_config = get_default_prompt_config()
    config["active_prompt"] = default_config["active_prompt"].copy()
    config["active_prompt"]["updated_at"] = datetime.utcnow().isoformat() + "Z"
    config["active_prompt"]["updated_by"] = "system"
    
    # Save
    if save_prompt_config(config):
        return True, None, config
    else:
        return False, "Failed to save configuration", None


def rollback_prompt(version: int) -> tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Rollback to a specific version from history.
    
    Args:
        version: The version number to rollback to
    
    Returns:
        (success, error_message, updated_config)
    """
    config = load_prompt_config()
    
    # Find the version in history
    target_prompt = None
    for historical_prompt in config["history"]:
        if historical_prompt.get("version") == version:
            target_prompt = historical_prompt
            break
    
    if not target_prompt:
        return False, f"Version {version} not found in history", None
    
    # Add current to history
    config = add_prompt_to_history(config)
    
    # Restore the target version
    config["active_prompt"] = target_prompt.copy()
    config["active_prompt"]["updated_at"] = datetime.utcnow().isoformat() + "Z"
    config["active_prompt"]["updated_by"] = "system"
    
    # Save
    if save_prompt_config(config):
        return True, None, config
    else:
        return False, "Failed to save configuration", None

