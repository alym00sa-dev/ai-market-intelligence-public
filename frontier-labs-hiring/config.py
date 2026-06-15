
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
        "source": "workday",
        "tenant": "nvidia",
        "board": "NVIDIAExternalCareerSite",
        "careers_url": "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
    },

    # ── Tier 2: HTML + Playwright scrapers ───────────────────────────────────
    {
        "name": "ByteDance",
        "source": "bytedance",
        "careers_url": "https://jobs.bytedance.com/en/position",
        # Keywords are unioned (deduped) against ByteDance's public search API to
        # capture all AI-tagged roles, incl. Chinese-language Doubao / 大模型 posts.
        "ai_filter": [
            "AI", "Machine Learning", "LLM", "Doubao", "大模型", "deep learning",
            "AI sales", "enterprise AI", "AI partnerships", "AI business development",
        ],
    },
    {
        "name": "Tencent",
        "source": "tencent",
        "careers_url": "https://careers.tencent.com/",
        # Focused AI keywords (unioned/deduped) to pull Hunyuan + AI roles across
        # business groups without dragging in Tencent's full conglomerate hiring.
        "ai_filter": [
            "AI", "machine learning", "large model", "LLM", "Hunyuan", "deep learning",
        ],
    },
    {
        "name": "Amazon AGI",
        "source": "html",
        "scraper": "amazon",
        "careers_url": "https://www.amazon.jobs/en/search",
        "ai_filter": [],
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
