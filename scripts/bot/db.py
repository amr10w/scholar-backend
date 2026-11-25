"""
PostgreSQL persistence layer for the job scraper.
"""

from __future__ import annotations

import hashlib
import json
import re
import os
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Iterator, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg2
import psycopg2.extras
from psycopg2.extensions import connection

from models import Job

SCHEMA_VERSION = 1

_TRACKING_QUERY_PREFIXES = ("utm_",)
_TRACKING_QUERY_KEYS = {
    "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid",
    "trk", "tracking_id", "ref", "refid",
}


@dataclass(frozen=True)
class StoredJob:
    id: int
    source: str
    source_job_id: str
    title: str
    company: str
    location: str
    url: str
    canonical_url: str
    salary: str
    job_type: str
    tags: list
    is_remote: bool
    original_source: str
    content_hash: str
    first_seen_at: str
    last_seen_at: str

    def to_job(self) -> Job:
        return Job(
            title=self.title,
            company=self.company,
            location=self.location,
            url=self.url,
            source=self.source,
            salary=self.salary,
            job_type=self.job_type,
            tags=self.tags,
            is_remote=self.is_remote,
            original_source=self.original_source,
        )


def _load_dotenv_fallback() -> None:
    """Load root .env file if POSTGRES_URL/DATABASE_URL are not set in the shell."""
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    if not os.path.isfile(env_path):
        return
    with open(env_path, encoding="utf-8") as fh:
        for raw_line in fh:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key in ("DATABASE_URL", "POSTGRES_URL") and val and not os.environ.get(key):
                os.environ[key] = val


def get_postgres_url() -> str:
    url = os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL")
    if not url:
        _load_dotenv_fallback()
        url = os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise ValueError(
            "DATABASE_URL / POSTGRES_URL environment variable is missing! "
            "Add DATABASE_URL in GitHub Repo -> Settings -> Secrets and variables -> Actions."
        )
    return url


@contextmanager
def connect(db_path: str = "") -> Iterator[connection]:
    """Open a PostgreSQL connection and ensure schema exists."""
    # db_path is ignored for postgres, kept for API compatibility with main.py
    conn = psycopg2.connect(get_postgres_url())
    try:
        init_db(conn)
        conn.commit()
        yield conn
        conn.commit()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(conn: connection) -> None:
    """Create the scraper's own tables (separate from Prisma-owned tables)."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS scraper_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS scraped_jobs (
                id SERIAL PRIMARY KEY,
                source TEXT NOT NULL,
                source_job_id TEXT DEFAULT '',
                title TEXT NOT NULL,
                company TEXT DEFAULT '',
                location TEXT DEFAULT '',
                url TEXT NOT NULL,
                canonical_url TEXT NOT NULL,
                salary TEXT DEFAULT '',
                job_type TEXT DEFAULT '',
                tags_json TEXT DEFAULT '[]',
                is_remote INTEGER DEFAULT 0,
                original_source TEXT DEFAULT '',
                content_hash TEXT NOT NULL UNIQUE,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );
        """)

        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_scraped_jobs_source
                ON scraped_jobs(source, last_seen_at);
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS scraper_source_runs (
                source TEXT PRIMARY KEY,
                last_run_at TEXT,
                status TEXT NOT NULL DEFAULT 'never',
                error TEXT DEFAULT '',
                updated_at TEXT NOT NULL
            );
        """)

        # Ensure Prisma's scraper columns exist on the shared jobs table
        cur.execute("""
            ALTER TABLE jobs
                ADD COLUMN IF NOT EXISTS "isTaken" BOOLEAN DEFAULT false,
                ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'manual',
                ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3),
                ADD COLUMN IF NOT EXISTS "contentHash" TEXT,
                ADD COLUMN IF NOT EXISTS "originalSource" TEXT,
                ADD COLUMN IF NOT EXISTS "numberVisited" INTEGER DEFAULT 0;
        """)

        cur.execute(
            """
            INSERT INTO scraper_metadata (key, value)
            VALUES (%s, %s)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """,
            ("schema_version", str(SCHEMA_VERSION)),
        )


def now_utc() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def normalize_company(value: object) -> str:
    text = normalize_text(value)
    suffixes = r"\b(inc|inc\.|ltd|ltd\.|llc|corp|corporation|company|co\.|gmbh|ag|sa|pvt)\b"
    text = re.sub(suffixes, "", text)
    text = re.sub(r"\s+", " ", text).strip(" ,.-")
    return text


def canonicalize_url(url: str) -> str:
    if not url:
        return ""
    split = urlsplit(url.strip())
    scheme = split.scheme.lower() or "https"
    netloc = split.netloc.lower()
    path = split.path.rstrip("/") or split.path
    kept_query_pairs: list[tuple[str, str]] = []
    for key, value in parse_qsl(split.query, keep_blank_values=True):
        key_l = key.lower()
        if key_l in _TRACKING_QUERY_KEYS:
            continue
        if any(key_l.startswith(prefix) for prefix in _TRACKING_QUERY_PREFIXES):
            continue
        kept_query_pairs.append((key, value))
    query = urlencode(kept_query_pairs, doseq=True)
    return urlunsplit((scheme, netloc, path, query, ""))


def job_content_hash(job: Job) -> str:
    canonical_url = canonicalize_url(job.url)
    raw = "|".join([
        normalize_text(job.title),
        normalize_company(job.company),
        normalize_text(job.location),
        canonical_url,
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


_COUNTRY_CODE_MAP = {
    "eg": "Egypt",
    "egy": "Egypt",
    "sa": "Saudi Arabia",
    "ksa": "Saudi Arabia",
    "ae": "United Arab Emirates",
    "uae": "United Arab Emirates",
    "us": "United States",
    "usa": "United States",
    "uk": "United Kingdom",
    "gb": "United Kingdom",
    "de": "Germany",
    "fr": "France",
    "it": "Italy",
    "es": "Spain",
    "nl": "Netherlands",
    "ca": "Canada",
    "tr": "Turkey",
    "in": "India",
    "jp": "Japan",
    "cn": "China",
    "tw": "Taiwan",
    "sg": "Singapore",
    "ch": "Switzerland",
    "se": "Sweden",
    "pl": "Poland",
    "ie": "Ireland",
    "au": "Australia",
    "jo": "Jordan",
    "qa": "Qatar",
    "kw": "Kuwait",
}


def extract_country(location: str, is_remote: bool = False) -> str:
    """Derive a canonical full country name (e.g. 'Egypt', 'United States', 'Remote')."""
    raw = (location or "").strip()
    lower = raw.lower()
    padded = f" {lower} "

    if lower in _COUNTRY_CODE_MAP:
        return _COUNTRY_CODE_MAP[lower]

    if any(p in lower for p in ("egypt", "مصر", "cairo", "alexandria", "giza", "smart village", "new cairo", "maadi", "mansoura", "tanta", "assiut", "aswan", "zagazig")):
        return "Egypt"
    if any(p in lower for p in ("saudi", "ksa", "السعودية", "riyadh", "jeddah", "dammam", "khobar", "neom")):
        return "Saudi Arabia"
    if any(p in lower for p in ("united arab emirates", "uae", "الإمارات", "dubai", "abu dhabi", "sharjah")):
        return "United Arab Emirates"
    if any(p in padded for p in (" united states", " usa ", " us ", " us,", " new york", " california", " texas", " seattle", " san francisco", " boston", " austin", " chicago")):
        return "United States"
    if any(p in lower for p in ("germany", "munich", "berlin", "frankfurt", "hamburg")):
        return "Germany"
    if any(p in lower for p in ("united kingdom", "london", "manchester", "cambridge", " uk")):
        return "United Kingdom"
    if any(p in lower for p in ("france", "paris", "lyon", "grenoble")):
        return "France"
    if any(p in lower for p in ("italy", "milan", "rome", "turin")):
        return "Italy"
    if any(p in lower for p in ("canada", "toronto", "vancouver", "montreal", "ottawa")):
        return "Canada"
    if any(p in lower for p in ("netherlands", "amsterdam", "eindhoven")):
        return "Netherlands"

    # Fallback: check last comma-separated segment against ISO codes
    if "," in raw:
        last_part = raw.split(",")[-1].strip()
        mapped = _COUNTRY_CODE_MAP.get(last_part.lower())
        if mapped:
            return mapped
        if last_part:
            return last_part

    if is_remote or any(p in lower for p in ("remote", "anywhere", "worldwide", "work from home")):
        return "Remote"
    return raw or "Remote"


def extract_city(location: str, country: str) -> str:
    """Extract city portion from a location string (e.g. 'Cairo, Egypt' -> 'Cairo')."""
    raw = (location or "").strip()
    if not raw:
        return ""
    if "," in raw:
        first = raw.split(",")[0].strip()
        return first
    if raw.lower() == country.lower():
        return ""
    return raw


def normalize_job_type(job_type: str, title: str = "") -> Optional[str]:
    """Map scraped job_type text to Prisma JobType enum: fullTime | partTime | internship."""
    combined = f"{job_type or ''} {title or ''}".lower()
    if any(k in combined for k in ("intern", "تدريب")):
        return "internship"
    if any(k in combined for k in ("part-time", "part time", "دوام جزئي")):
        return "partTime"
    if any(k in combined for k in ("full-time", "full time", "دوام كامل")):
        return "fullTime"
    return None


def infer_seniority(title: str) -> Optional[str]:
    """Map job title keywords to Prisma SeniorityLevel enum: junior | mid | senior | lead."""
    t = f" {(title or '').lower()} "
    if any(k in t for k in (" lead ", " principal ", " staff ", " architect ", " manager ", " head ", " director ")):
        return "lead"
    if any(k in t for k in (" senior ", " sr.", " sr ")):
        return "senior"
    if any(k in t for k in (" junior ", " jr.", " jr ", " entry ", " fresh ", " graduate ", " intern ", " internship ")):
        return "junior"
    if any(k in t for k in (" mid ", " mid-level ", " intermediate ")):
        return "mid"
    return None


def infer_industry(title: str, tags: list) -> str:
    """Derive a clean discipline/industry label matching frontend filters."""
    text = f"{title or ''} {' '.join(str(x) for x in (tags or []))}".lower()
    if any(k in text for k in ("vlsi", "rtl", "asic", "fpga", "physical design", "silicon", "dft", "verification", "analog", "ic design", "eda")):
        return "VLSI & Hardware"
    if any(k in text for k in ("embedded", "firmware", "autosar", "rtos", "microcontroller", "automotive", "iot")):
        return "Embedded Systems"
    if any(k in text for k in ("machine learning", "deep learning", "artificial intelligence", " ai ", "nlp", "computer vision", "llm", "mlops")):
        return "AI & Machine Learning"
    if any(k in text for k in ("devops", "cloud", "kubernetes", "docker", "sre", "terraform", "aws", "azure", "gcp")):
        return "Cloud & DevOps"
    if any(k in text for k in ("data scientist", "data engineer", "data analyst", "analytics", "bi ", "etl")):
        return "Data Engineering"
    if any(k in text for k in ("security", "cybersecurity", "soc ", "pentest", "infosec")):
        return "Cybersecurity"
    if any(k in text for k in ("qa", "quality assurance", "test engineer", "sdet", "automation test")):
        return "QA & Testing"
    if any(k in text for k in ("android", "ios", "flutter", "react native", "mobile")):
        return "Mobile Development"
    if any(k in text for k in ("frontend", "front-end", "front end", "react", "next.js", "angular", "vue")):
        return "Frontend Development"
    if any(k in text for k in ("backend", "back-end", "back end", "node", "django", "spring", "fastapi", "laravel", ".net", "golang")):
        return "Backend Development"
    return "Software Engineering"


def upsert_job(conn: connection, job: Job) -> tuple[int, bool]:
    if not job.title or not job.url:
        raise ValueError("Job must have a title and url before persistence.")

    ts = now_utc()
    content_hash = job_content_hash(job)
    domains_json = json.dumps(job.tags or [], ensure_ascii=False)
    country = extract_country(job.location, bool(job.is_remote))
    city = extract_city(job.location, country)
    job_type_enum = normalize_job_type(job.job_type, job.title)
    seniority_enum = infer_seniority(job.title)
    industry = infer_industry(job.title, job.tags or [])
    is_taken = bool(getattr(job, "is_taken", False))

    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute('SELECT id FROM jobs WHERE "contentHash" = %s', (content_hash,))
        existing = cur.fetchone()

        if existing:
            job_id = existing["id"]
            cur.execute(
                '''
                UPDATE jobs
                SET source = %s,
                    title = %s,
                    industry = COALESCE(industry, %s),
                    domains = COALESCE(domains, %s::jsonb),
                    type = COALESCE(type, %s::"JobType"),
                    seniority = COALESCE(seniority, %s::"SeniorityLevel"),
                    "applyLink" = %s,
                    "salary" = %s,
                    "originalSource" = %s,
                    "isTaken" = %s,
                    "lastCheckedAt" = %s,
                    "updatedAt" = %s
                WHERE id = %s
                ''',
                (
                    job.source, job.title, industry, domains_json,
                    job_type_enum, seniority_enum, job.url, job.salary or None,
                    job.original_source or None, is_taken, ts, ts, job_id
                )
            )
            return job_id, False

        # 1. Upsert Company (preserve existing metadata; set HQ country if new)
        hq_country = None if country == "Remote" else country
        cur.execute(
            'INSERT INTO companies (name, "headquartersCountry", "updatedAt") VALUES (%s, %s, NOW()) '
            'ON CONFLICT (name) DO UPDATE SET '
            '"headquartersCountry" = COALESCE(companies."headquartersCountry", EXCLUDED."headquartersCountry"), '
            '"updatedAt" = NOW() RETURNING id',
            (job.company or "Unknown", hq_country)
        )
        company_id = cur.fetchone()[0]

        # 2. Upsert Branch (match by companyId + country so each country gets its own branch)
        cur.execute(
            'SELECT id FROM "companyBranches" WHERE "companyId" = %s AND LOWER(COALESCE(country, \'\')) = LOWER(%s) LIMIT 1',
            (company_id, country)
        )
        branch_row = cur.fetchone()
        if branch_row:
            branch_id = branch_row[0]
        else:
            cur.execute(
                'INSERT INTO "companyBranches" ("companyId", city, country) VALUES (%s, %s, %s) RETURNING id',
                (company_id, city or None, country)
            )
            branch_id = cur.fetchone()[0]

        # 3. Insert Job with full Prisma schema fields
        cur.execute(
            '''
            INSERT INTO jobs (
                source, title, "companyId", "branchId",
                industry, domains, type, seniority,
                "applyLink", "salary", "originalSource", "contentHash",
                "postedAt", "lastCheckedAt", "updatedAt", "isTaken"
            )
            VALUES (
                %s, %s, %s, %s,
                %s, %s::jsonb, %s::"JobType", %s::"SeniorityLevel",
                %s, %s, %s, %s,
                %s, %s, %s, %s
            )
            RETURNING id
            ''',
            (
                job.source, job.title, company_id, branch_id,
                industry, domains_json, job_type_enum, seniority_enum,
                job.url, job.salary or None, job.original_source or None, content_hash,
                ts, ts, ts, is_taken
            )
        )
        row = cur.fetchone()
        return (row[0] if row else 0), True


def upsert_jobs(conn: connection, jobs: list[Job]) -> tuple[int, int]:
    inserted = 0
    refreshed = 0
    for job in jobs:
        _, is_new = upsert_job(conn, job)
        if is_new:
            inserted += 1
        else:
            refreshed += 1
    return inserted, refreshed


def update_source_run(conn: connection, source: str, status: str, error: str = "", last_run_at: Optional[str] = None) -> None:
    ts = now_utc()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO scraper_source_runs(source, last_run_at, status, error, updated_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT(source) DO UPDATE SET
                last_run_at = EXCLUDED.last_run_at,
                status = EXCLUDED.status,
                error = EXCLUDED.error,
                updated_at = EXCLUDED.updated_at
            """,
            (source, last_run_at or ts, status, error or "", ts)
        )


def get_source_last_run(conn: connection, source: str) -> Optional[str]:
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute("SELECT last_run_at FROM scraper_source_runs WHERE source = %s", (source,))
        row = cur.fetchone()
        return str(row["last_run_at"]) if row and row["last_run_at"] else None


def count_jobs(conn: connection) -> int:
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute("SELECT COUNT(*) AS c FROM jobs")
        row = cur.fetchone()
        return int(row["c"]) if row else 0


def _row_to_stored_job(row: dict) -> StoredJob:
    tags = []
    try:
        loaded = json.loads(row["tags_json"] or "[]")
        tags = loaded if isinstance(loaded, list) else []
    except json.JSONDecodeError:
        tags = []

    return StoredJob(
        id=int(row["id"]),
        source=row["source"],
        source_job_id=row["source_job_id"] or "",
        title=row["title"],
        company=row["company"] or "",
        location=row["location"] or "",
        url=row["url"],
        canonical_url=row["canonical_url"],
        salary=row["salary"] or "",
        job_type=row["job_type"] or "",
        tags=tags,
        is_remote=bool(row["is_remote"]),
        original_source=row["original_source"] or "",
        content_hash=row["content_hash"],
        first_seen_at=row["first_seen_at"],
        last_seen_at=row["last_seen_at"],
    )
