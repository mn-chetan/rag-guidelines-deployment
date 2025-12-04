"""Admin module for managing URLs and scheduled re-crawling."""
import json
import hashlib
import logging
import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from google.cloud import storage

logger = logging.getLogger(__name__)

# GCS Configuration
GCS_BUCKET = "rag-guidelines-v2"
CONFIG_PATH = "config/managed_urls.json"

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
        bucket = client.bucket(GCS_BUCKET)
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
        bucket = client.bucket(GCS_BUCKET)
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
        bucket = client.bucket(GCS_BUCKET)
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


def start_job(job_type: str, url_ids: List[str]) -> str:
    """Start a new indexing job and return job ID."""
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
