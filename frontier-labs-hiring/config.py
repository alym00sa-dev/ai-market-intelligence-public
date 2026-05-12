
"""
Company configurations for scraping.

source:    'greenhouse' | 'lever' | 'ashby' | 'html'
board_id:  the company's slug on that platform (unused for 'html')
careers_url: the HTML page to scrape (used for 'html' or as fallback)
eu:        True if Greenhouse EU board (boards-api.eu.greenhouse.io)
ai_filter: search terms / path params used when scraping custom HTML sites
"""

COMPANIES = [
    # ── Tier 1: clean JSON APIs ──────────────────────────────────────────────
    {
        "name": "Anthropic",
        "source": "greenhouse",
        "board_id": "anthropic",
        "careers_url": "https://www.anthropic.com/careers",
    },
    {
        "name": "Google",
        "source": "html",
        "scraper": "google",
        "careers_url": "https://www.google.com/about/careers/applications/jobs/results/?q=AI",
        "ai_filter": [],
    },
    {
        "name": "xAI",
        "source": "greenhouse",
        "board_id": "xai",
        "careers_url": "https://x.ai/careers",
    },
    {
        "name": "Inflection AI",
        "source": "greenhouse",
        "board_id": "inflectionai",
        "careers_url": "https://inflection.ai/careers",
    },
    {
        "name": "Stability AI",
        "source": "greenhouse",
        "board_id": "stabilityai",
        "careers_url": "https://stability.ai/careers",
    },
    {
        "name": "Mistral AI",
        "source": "lever",
        "board_id": "mistral",
        "careers_url": "https://mistral.ai/company/careers",
    },
    {
        "name": "OpenAI",
        "source": "ashby",
        "board_id": "openai",
        "careers_url": "https://openai.com/careers",
    },
    {
        "name": "Cohere",
        "source": "ashby",
        "board_id": "cohere",
        "careers_url": "https://cohere.com/careers",
    },
    {
        "name": "Moonshot AI",
        "source": "ashby",
        "board_id": "moonshot-ai",
        "careers_url": "https://www.moonshot.cn/careers",
    },

    {
        "name": "NVIDIA",
        "source": "playwright",
        "scraper": "nvidia",
        "careers_url": "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
        "ai_filter": [],
    },

    # ── Tier 2: HTML + Playwright scrapers ───────────────────────────────────
    {
        "name": "Meta AI",
        "source": "playwright",
        "scraper": "meta",
        "careers_url": "https://www.metacareers.com/jobs",
        "ai_filter": [
            "Artificial Intelligence", "Machine Learning", "AI Research", "GenAI",
            "AI enterprise sales", "AI solutions", "AI partnerships", "AI go-to-market",
        ],
    },
    {
        "name": "ByteDance",
        "source": "playwright",
        "scraper": "bytedance",
        "careers_url": "https://jobs.bytedance.com/en/position",
        "ai_filter": [
            "AI", "Machine Learning", "LLM", "Doubao",
            "AI sales", "enterprise AI", "AI partnerships", "AI business development",
        ],
    },
    {
        "name": "SenseTime",
        "source": "html",
        "scraper": "sensetime",
        "careers_url": "https://joinus.sensetime.com/en",
        "ai_filter": [],
    },
    {
        "name": "Amazon AGI",
        "source": "html",
        "scraper": "amazon",
        "careers_url": "https://www.amazon.jobs/en/search",
        "ai_filter": [],
    },
    {
        "name": "Apple ML Research",
        "source": "playwright",
        "scraper": "apple",
        "careers_url": "https://jobs.apple.com/en-us/search",
        "ai_filter": [
            "machine learning", "AI research", "language model",
            "AI enterprise", "AI sales", "AI solutions",
        ],
    },
    {
        "name": "Microsoft Research",
        "source": "playwright",
        "scraper": "microsoft",
        "careers_url": "https://careers.microsoft.com/v2/global/en/search",
        "ai_filter": [
            "AI research", "machine learning research", "large language model",
            "Copilot sales", "Azure AI sales", "AI cloud sales", "AI solutions architect",
            "AI go-to-market", "AI partnerships", "AI business development",
        ],
    },
]
