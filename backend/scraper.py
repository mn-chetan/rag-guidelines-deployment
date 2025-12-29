"""Web scraper module for extracting clean content from URLs."""
import logging
import httpx
import trafilatura
import ipaddress
import socket
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# SSRF Protection: Blocked protocols and patterns
BLOCKED_PROTOCOLS = {'file', 'javascript', 'data', 'vbscript', 'ftp', 'gopher'}


def validate_url_ssrf(url: str) -> Tuple[bool, str]:
    """
    Validate URL to prevent SSRF attacks.

    Returns:
        Tuple of (is_safe, error_message)
    """
    try:
        parsed = urlparse(url)

        # Check for blocked protocols
        if parsed.scheme.lower() in BLOCKED_PROTOCOLS:
            return False, f"Protocol '{parsed.scheme}' is not allowed"

        # Only allow http and https
        if parsed.scheme.lower() not in ('http', 'https'):
            return False, f"Only HTTP and HTTPS protocols are allowed"

        # Check for empty or missing host
        if not parsed.netloc or not parsed.hostname:
            return False, "Invalid URL: missing hostname"

        hostname = parsed.hostname

        # Block localhost variations
        localhost_patterns = {'localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'}
        if hostname.lower() in localhost_patterns:
            return False, "Localhost URLs are not allowed"

        # Try to resolve hostname and check if it's a private/internal IP
        try:
            # Check if hostname is already an IP address
            try:
                ip = ipaddress.ip_address(hostname)
                if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local:
                    return False, "Internal/private IP addresses are not allowed"
            except ValueError:
                # Not a direct IP, try to resolve the hostname
                try:
                    resolved_ips = socket.getaddrinfo(hostname, None)
                    for _, _, _, _, sockaddr in resolved_ips:
                        ip = ipaddress.ip_address(sockaddr[0])
                        if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local:
                            return False, f"URL resolves to internal IP address"
                except socket.gaierror:
                    # DNS resolution failed - could be valid external domain
                    # Let the actual request handle this
                    pass
        except Exception as e:
            logger.warning(f"IP validation error for {hostname}: {e}")
            # Continue if validation fails - let actual request handle it

        # Block common internal hostnames
        internal_patterns = ['internal', 'intranet', 'corp', 'private', 'local']
        hostname_lower = hostname.lower()
        for pattern in internal_patterns:
            if pattern in hostname_lower and not hostname_lower.endswith('.com'):
                return False, "Internal hostnames are not allowed"

        # Check for URL with credentials
        if parsed.username or parsed.password:
            return False, "URLs with credentials are not allowed"

        return True, ""

    except Exception as e:
        return False, f"URL validation error: {str(e)}"

class WebScraper:
    """Handles web page scraping with multiple fallback strategies."""

    def __init__(self, timeout: int = 30):
        self.timeout = timeout
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }

    async def scrape_url(self, url: str) -> Dict[str, str]:
        """
        Scrape a URL and extract clean content.

        Args:
            url: The URL to scrape

        Returns:
            Dict with keys: url, title, content, domain, success, error
        """
        try:
            # SSRF Protection: Validate URL before making request
            is_safe, ssrf_error = validate_url_ssrf(url)
            if not is_safe:
                logger.warning(f"SSRF protection blocked URL: {url} - {ssrf_error}")
                return {
                    "url": url,
                    "success": False,
                    "error": ssrf_error
                }

            # Basic URL validation
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                return {
                    "url": url,
                    "success": False,
                    "error": "Invalid URL format"
                }

            logger.info(f"Scraping URL: {url}")

            # Fetch the page asynchronously
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True, headers=self.headers) as client:
                try:
                    response = await client.get(url)
                    response.raise_for_status()
                    html_text = response.text
                except httpx.TimeoutException:
                    return {
                        "url": url,
                        "success": False,
                        "error": "Request timeout - site took too long to respond"
                    }
                except httpx.RequestError as e:
                    return {
                        "url": url,
                        "success": False,
                        "error": f"Failed to fetch URL: {str(e)}"
                    }
                except httpx.HTTPStatusError as e:
                    return {
                        "url": url,
                        "success": False,
                        "error": f"HTTP error {e.response.status_code}: {e.response.reason_phrase}"
                    }

            # Try trafilatura first (best for article extraction)
            content = self._extract_with_trafilatura(html_text, url)

            # Fallback to BeautifulSoup if trafilatura returns minimal content
            if not content or len(content.get("content", "")) < 100:
                logger.info("Trafilatura extraction minimal, falling back to BeautifulSoup")
                content = self._extract_with_beautifulsoup(html_text, url)

            if not content or len(content.get("content", "")) < 50:
                return {
                    "url": url,
                    "success": False,
                    "error": "Extracted content too short or empty"
                }

            # Add domain info
            content["domain"] = parsed.netloc
            content["url"] = url
            content["success"] = True

            logger.info(f"Successfully scraped {url}: {len(content['content'])} chars")
            return content

        except Exception as e:
            logger.error(f"Unexpected error scraping {url}: {e}", exc_info=True)
            return {
                "url": url,
                "success": False,
                "error": f"Unexpected error: {str(e)}"
            }

    def _extract_with_trafilatura(self, html: str, url: str) -> Optional[Dict[str, str]]:
        """Extract content using trafilatura (best for articles)."""
        try:
            # Extract main content with markdown formatting to preserve structure
            content = trafilatura.extract(
                html,
                include_comments=False,
                include_tables=True,
                include_images=False,
                output_format='markdown',  # Preserves headers, lists, and structure
                url=url
            )

            if not content:
                return None

            # Extract metadata for title
            metadata = trafilatura.extract_metadata(html)
            title = metadata.title if metadata and metadata.title else self._extract_title_fallback(html)

            return {
                "title": title or "Untitled",
                "content": content.strip()
            }
        except Exception as e:
            logger.warning(f"Trafilatura extraction failed: {e}")
            return None

    def _extract_with_beautifulsoup(self, html: str, url: str) -> Optional[Dict[str, str]]:
        """Fallback extraction using BeautifulSoup."""
        try:
            soup = BeautifulSoup(html, 'html.parser')

            # Extract title
            title = None
            if soup.title:
                title = soup.title.string
            if not title:
                title = self._extract_title_fallback(html)

            # Remove script, style, nav, footer, header elements
            for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'form']):
                element.decompose()

            # Try to find main content area
            main_content = soup.find('main') or soup.find('article') or soup.find('div', class_='content')

            if main_content:
                text = main_content.get_text(separator='\n', strip=True)
            else:
                # Fall back to body
                text = soup.body.get_text(separator='\n', strip=True) if soup.body else soup.get_text(separator='\n', strip=True)

            # Clean up whitespace
            lines = [line.strip() for line in text.split('\n') if line.strip()]
            content = '\n'.join(lines)

            return {
                "title": title or "Untitled",
                "content": content
            }
        except Exception as e:
            logger.warning(f"BeautifulSoup extraction failed: {e}")
            return None

    def _extract_title_fallback(self, html: str) -> str:
        """Fallback method to extract title from HTML."""
        soup = BeautifulSoup(html, 'html.parser')

        # Try og:title
        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            return og_title['content']

        # Try h1
        h1 = soup.find('h1')
        if h1:
            return h1.get_text(strip=True)

        return "Untitled"


async def scrape_url(url: str) -> Dict[str, str]:
    """Convenience function to scrape a URL."""
    scraper = WebScraper()
    return await scraper.scrape_url(url)