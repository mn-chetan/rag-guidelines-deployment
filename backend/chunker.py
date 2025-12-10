"""
Semantic chunking for guideline documents.
Preserves document structure and section boundaries.
"""
import re
import hashlib
import logging
from typing import List, Dict, Optional
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


class GuidelineChunker:
    """Semantic chunker that respects document structure."""
    
    def __init__(
        self,
        target_chunk_size: int = 1000,
        max_chunk_size: int = 1500,
        overlap: int = 100
    ):
        """Initialize chunker with size parameters.
        
        Args:
            target_chunk_size: Target size for chunks (characters)
            max_chunk_size: Maximum allowed chunk size
            overlap: Overlap between consecutive chunks (characters)
        """
        self.target_chunk_size = target_chunk_size
        self.max_chunk_size = max_chunk_size
        self.overlap = overlap
        
        logger.info(
            f"Initialized chunker: target={target_chunk_size}, "
            f"max={max_chunk_size}, overlap={overlap}"
        )
    
    def chunk_html(
        self, 
        html: str, 
        source_url: str, 
        doc_title: Optional[str] = None
    ) -> List[Dict]:
        """Chunk HTML document.
        
        Extracts text and preserves structure.
        
        Args:
            html: HTML content
            source_url: Original URL
            doc_title: Document title
            
        Returns:
            List of chunk dictionaries
        """
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # Extract title if not provided
            if not doc_title:
                title_tag = soup.find('title')
                doc_title = title_tag.get_text() if title_tag else source_url
            
            # Extract main content (try article, main, or body)
            content_tag = (
                soup.find('article') or 
                soup.find('main') or 
                soup.find('body') or 
                soup
            )
            
            # Convert to markdown-like text with structure
            text = self._html_to_structured_text(content_tag)
            
            # Chunk the structured text
            return self.chunk_markdown(text, source_url, doc_title)
            
        except Exception as e:
            logger.error(f"Failed to chunk HTML: {e}")
            # Fallback to plain text
            return self.chunk_text(html, source_url, doc_title)
    
    def _html_to_structured_text(self, element) -> str:
        """Convert HTML to structured text preserving headers and lists.
        
        Args:
            element: BeautifulSoup element
            
        Returns:
            Structured text with markdown-like formatting
        """
        lines = []
        
        for child in element.descendants:
            if child.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                level = int(child.name[1])
                text = child.get_text().strip()
                if text:
                    lines.append(f"\n{'#' * level} {text}\n")
            
            elif child.name == 'p':
                text = child.get_text().strip()
                if text:
                    lines.append(f"{text}\n")
            
            elif child.name in ['ul', 'ol']:
                # Lists are handled by their li children
                pass
            
            elif child.name == 'li':
                text = child.get_text().strip()
                if text:
                    lines.append(f"- {text}")
        
        return '\n'.join(lines)
    
    def chunk_markdown(
        self, 
        content: str, 
        source_url: str, 
        doc_title: Optional[str] = None
    ) -> List[Dict]:
        """Chunk markdown document.
        
        Splits by headers while respecting size limits.
        
        Args:
            content: Markdown content
            source_url: Original URL
            doc_title: Document title
            
        Returns:
            List of chunk dictionaries
        """
        if not doc_title:
            doc_title = source_url
        
        # Split by headers (## and ###)
        sections = self._split_by_headers(content)
        
        chunks = []
        for section_title, section_text in sections:
            # If section is small enough, keep as one chunk
            if len(section_text) <= self.max_chunk_size:
                chunk = self._create_chunk(
                    text=section_text,
                    source_url=source_url,
                    doc_title=doc_title,
                    section=section_title,
                    index=len(chunks)
                )
                chunks.append(chunk)
            else:
                # Split large sections
                sub_chunks = self._split_long_section(section_text, section_title)
                for i, sub_text in enumerate(sub_chunks):
                    chunk = self._create_chunk(
                        text=sub_text,
                        source_url=source_url,
                        doc_title=doc_title,
                        section=section_title,
                        index=len(chunks)
                    )
                    chunks.append(chunk)
        
        logger.info(f"Created {len(chunks)} chunks from {source_url}")
        return chunks
    
    def chunk_text(
        self, 
        content: str, 
        source_url: str, 
        doc_title: Optional[str] = None
    ) -> List[Dict]:
        """Chunk plain text document.
        
        Uses paragraph boundaries.
        
        Args:
            content: Plain text content
            source_url: Original URL
            doc_title: Document title
            
        Returns:
            List of chunk dictionaries
        """
        if not doc_title:
            doc_title = source_url
        
        # Split by paragraphs (double newline)
        paragraphs = re.split(r'\n\s*\n', content)
        
        chunks = []
        current_chunk = ""
        
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            
            # If adding this paragraph exceeds max size, save current chunk
            if current_chunk and len(current_chunk) + len(para) > self.max_chunk_size:
                chunk = self._create_chunk(
                    text=current_chunk,
                    source_url=source_url,
                    doc_title=doc_title,
                    section="Content",
                    index=len(chunks)
                )
                chunks.append(chunk)
                
                # Start new chunk with overlap
                if self.overlap > 0:
                    overlap_text = current_chunk[-self.overlap:]
                    current_chunk = overlap_text + "\n\n" + para
                else:
                    current_chunk = para
            else:
                # Add to current chunk
                if current_chunk:
                    current_chunk += "\n\n" + para
                else:
                    current_chunk = para
        
        # Add final chunk
        if current_chunk:
            chunk = self._create_chunk(
                text=current_chunk,
                source_url=source_url,
                doc_title=doc_title,
                section="Content",
                index=len(chunks)
            )
            chunks.append(chunk)
        
        logger.info(f"Created {len(chunks)} chunks from {source_url}")
        return chunks
    
    def _split_by_headers(self, content: str) -> List[tuple]:
        """Split content by markdown headers.
        
        Args:
            content: Markdown text
            
        Returns:
            List of (section_title, section_text) tuples
        """
        sections = []
        current_section = "Introduction"
        current_text = []
        
        lines = content.split('\n')
        
        for line in lines:
            # Check for headers (## or ###)
            header_match = re.match(r'^(#{2,3})\s+(.+)$', line)
            
            if header_match:
                # Save previous section
                if current_text:
                    sections.append((
                        current_section,
                        '\n'.join(current_text).strip()
                    ))
                
                # Start new section
                current_section = header_match.group(2).strip()
                current_text = [line]  # Include header in section
            else:
                current_text.append(line)
        
        # Add final section
        if current_text:
            sections.append((
                current_section,
                '\n'.join(current_text).strip()
            ))
        
        return sections
    
    def _split_long_section(self, text: str, section: str) -> List[str]:
        """Split oversized sections while respecting sentence boundaries.
        
        Args:
            text: Section text
            section: Section title
            
        Returns:
            List of sub-chunk texts
        """
        # Split by sentences
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            # If adding this sentence exceeds max size, save current chunk
            if current_chunk and len(current_chunk) + len(sentence) > self.max_chunk_size:
                chunks.append(current_chunk.strip())
                
                # Start new chunk with overlap
                if self.overlap > 0:
                    overlap_text = current_chunk[-self.overlap:]
                    current_chunk = overlap_text + " " + sentence
                else:
                    current_chunk = sentence
            else:
                # Add to current chunk
                if current_chunk:
                    current_chunk += " " + sentence
                else:
                    current_chunk = sentence
        
        # Add final chunk
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks
    
    def _generate_chunk_id(self, source_url: str, section: str, index: int) -> str:
        """Generate deterministic chunk ID.
        
        Args:
            source_url: Source URL
            section: Section title
            index: Chunk index
            
        Returns:
            16-character hex ID
        """
        content = f"{source_url}:{section}:{index}"
        return hashlib.sha256(content.encode()).hexdigest()[:16]
    
    def _create_chunk(
        self,
        text: str,
        source_url: str,
        doc_title: str,
        section: str,
        index: int
    ) -> Dict:
        """Create a chunk dictionary.
        
        Args:
            text: Chunk text
            source_url: Source URL
            doc_title: Document title
            section: Section title
            index: Chunk index
            
        Returns:
            Chunk dictionary
        """
        chunk_id = self._generate_chunk_id(source_url, section, index)
        
        return {
            "id": chunk_id,
            "text": text,
            "source_url": source_url,
            "doc_title": doc_title,
            "section": section,
            "index": index,
            "char_count": len(text)
        }
