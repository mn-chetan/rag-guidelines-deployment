"""
Suggestion Service - Edge LLM-powered query suggestions
Provides semantic "Related Questions" based on partial user input
"""

import logging
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig

from config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Use a fast, lightweight model for suggestions
SUGGESTION_MODEL_ID = "gemini-2.0-flash-lite"

# Initialize model lazily
_suggestion_model = None


def get_suggestion_model():
    """Get or initialize the suggestion model."""
    global _suggestion_model
    if _suggestion_model is None:
        _suggestion_model = GenerativeModel(SUGGESTION_MODEL_ID)
    return _suggestion_model


class SuggestionRequest(BaseModel):
    partial_query: str
    context: str = "auditing guidelines"
    max_suggestions: int = 3


class SuggestionResponse(BaseModel):
    suggestions: list[str]
    partial_query: str


@router.post("/suggestions", response_model=SuggestionResponse)
async def get_suggestions(request: SuggestionRequest):
    """
    Generate related question suggestions using Gemini Flash.

    This endpoint is designed for low latency (<500ms) to provide
    real-time suggestions as users type their queries.
    """
    partial_query = request.partial_query.strip()

    # Minimum query length check
    if len(partial_query) < 5:
        return SuggestionResponse(
            suggestions=[],
            partial_query=partial_query
        )

    # Cap max suggestions
    max_suggestions = min(request.max_suggestions, 5)

    try:
        model = get_suggestion_model()

        prompt = f"""You are helping quality auditors who review content against guidelines.

Given this partial search query about {request.context}:
"{partial_query}"

Generate {max_suggestions} complete, related questions that an auditor might want to ask.

Rules:
- Each question should be a complete, well-formed question
- Questions should be relevant to auditing and content review
- Keep each question under 60 characters
- Questions should be distinct from each other
- Do NOT number the questions or use bullet points
- Return ONLY the questions, one per line, nothing else

Example output format:
What are the rules for alcohol imagery?
How should I handle ambiguous cases?
When should I escalate to a supervisor?"""

        generation_config = GenerationConfig(
            temperature=0.7,
            max_output_tokens=200,
            top_p=0.9,
        )

        response = await model.generate_content_async(
            prompt,
            generation_config=generation_config
        )

        # Parse response - split by newlines and filter
        raw_suggestions = response.text.strip().split('\n')
        suggestions = []

        for line in raw_suggestions:
            line = line.strip()
            # Skip empty lines, numbered items, bullets
            if not line:
                continue
            # Remove leading numbers/bullets if present
            if line[0].isdigit():
                line = line.lstrip('0123456789.-) ')
            if line.startswith(('-', '*', '•')):
                line = line[1:].strip()
            # Validate length and content
            if 5 < len(line) < 80 and '?' in line:
                suggestions.append(line)

        # Limit to max_suggestions
        suggestions = suggestions[:max_suggestions]

        logger.info(f"Generated {len(suggestions)} suggestions for: '{partial_query[:30]}...'")

        return SuggestionResponse(
            suggestions=suggestions,
            partial_query=partial_query
        )

    except Exception as e:
        logger.error(f"Suggestion generation failed: {e}")
        # Return empty suggestions on error - don't fail the request
        return SuggestionResponse(
            suggestions=[],
            partial_query=partial_query
        )
