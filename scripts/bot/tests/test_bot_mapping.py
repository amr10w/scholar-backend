import json
import os
import sys
import types
import unittest
from unittest.mock import MagicMock

BOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BOT_DIR not in sys.path:
    sys.path.insert(0, BOT_DIR)

# Allow unit tests to run even on machines without native psycopg2 / curl_cffi wheels
if "psycopg2" not in sys.modules:
    try:
        import psycopg2  # noqa: F401
    except ImportError:
        fake_pg = types.ModuleType("psycopg2")
        fake_extras = types.ModuleType("psycopg2.extras")
        fake_extras.DictCursor = object
        fake_ext = types.ModuleType("psycopg2.extensions")
        fake_ext.connection = object
        fake_pg.extras = fake_extras
        fake_pg.extensions = fake_ext
        sys.modules["psycopg2"] = fake_pg
        sys.modules["psycopg2.extras"] = fake_extras
        sys.modules["psycopg2.extensions"] = fake_ext

if "curl_cffi" not in sys.modules:
    try:
        import curl_cffi  # noqa: F401
    except ImportError:
        fake_cffi = types.ModuleType("curl_cffi")
        fake_requests = types.ModuleType("curl_cffi.requests")
        fake_errors = types.ModuleType("curl_cffi.requests.errors")
        fake_errors.RequestsError = Exception
        fake_requests.errors = fake_errors
        fake_requests.Session = MagicMock
        fake_cffi.requests = fake_requests
        sys.modules["curl_cffi"] = fake_cffi
        sys.modules["curl_cffi.requests"] = fake_requests
        sys.modules["curl_cffi.requests.errors"] = fake_errors

from db import (
    extract_city,
    extract_country,
    infer_industry,
    infer_seniority,
    normalize_job_type,
    upsert_job,
)
from models import Job, passes_geo_filter
from sources import ALL_FETCHERS
from sources.linkedin import LINKEDIN_SEARCHES, TARGET_COMPANIES


class BotMappingAndSourcesTests(unittest.TestCase):
    def test_wuzzuf_and_linkedin_are_both_enabled(self):
        names = [name for name, _ in ALL_FETCHERS]
        self.assertIn("WUZZUF", names)
        self.assertIn("LinkedIn", names)

    def test_target_companies_are_included_in_linkedin_searches(self):
        self.assertGreaterEqual(len(TARGET_COMPANIES), 15)
        keywords = {s["keywords"] for s in LINKEDIN_SEARCHES}
        self.assertIn("STMicroelectronics", keywords)
        self.assertIn("Siemens", keywords)
        self.assertIn("MediaTek", keywords)

    def test_geo_filter_allows_egypt_saudi_uae_usa_and_remote(self):
        for loc in ("Cairo, Egypt", "Riyadh, Saudi Arabia", "Dubai, UAE", "Austin, Texas, USA"):
            job = Job("Software Engineer", "Siemens", loc, "https://example.com/1", "linkedin")
            self.assertTrue(passes_geo_filter(job), f"Expected {loc} to pass geo filter")

        remote_job = Job("Backend Engineer", "Acme", "Remote", "https://example.com/2", "linkedin", is_remote=True)
        self.assertTrue(passes_geo_filter(remote_job))

    def test_extract_country_and_city_return_full_country_names(self):
        self.assertEqual(extract_country("EG"), "Egypt")
        self.assertEqual(extract_country("New Cairo, Cairo, Egypt"), "Egypt")
        self.assertEqual(extract_city("New Cairo, Cairo, Egypt", "Egypt"), "New Cairo")
        self.assertEqual(extract_country("FR"), "France")
        self.assertEqual(extract_country("Dubai, UAE"), "United Arab Emirates")
        self.assertEqual(extract_country("Austin, Texas, US"), "United States")
        self.assertEqual(extract_country("", is_remote=True), "Remote")

    def test_job_type_seniority_and_industry_mapping(self):
        self.assertEqual(normalize_job_type("Full Time"), "fullTime")
        self.assertEqual(normalize_job_type("Part-time"), "partTime")
        self.assertEqual(normalize_job_type("", "Summer Software Internship"), "internship")
        self.assertIsNone(normalize_job_type("Contract"))

        self.assertEqual(infer_seniority("Senior Physical Design Engineer"), "senior")
        self.assertEqual(infer_seniority("Principal Silicon Architect"), "lead")
        self.assertEqual(infer_seniority("Junior Embedded Engineer"), "junior")
        self.assertEqual(infer_seniority("Mid-Level Backend Developer"), "mid")

        self.assertEqual(infer_industry("Senior Physical Design Engineer (RTL2GDS)", ["VLSI"]), "VLSI & Hardware")
        self.assertEqual(infer_industry("Embedded Firmware Engineer", ["AUTOSAR"]), "Embedded Systems")
        self.assertEqual(infer_industry("Cloud & DevOps Engineer", ["Kubernetes"]), "Cloud & DevOps")

    def test_upsert_job_writes_all_prisma_fields(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [
            None,   # existing job lookup -> not found
            (7,),   # upsert company -> id 7
            None,   # branch lookup -> not found
            (11,),  # insert branch -> id 11
            (99,),  # insert job -> id 99
        ]
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        job = Job(
            title="Senior Physical Design Engineer (RTL2GDS)",
            company="STMicroelectronics",
            location="Cairo, Egypt",
            url="https://www.linkedin.com/jobs/view/123456",
            source="linkedin",
            job_type="Full-time",
            tags=["VLSI", "RTL"],
            is_remote=False,
        )

        job_id, is_new = upsert_job(mock_conn, job)
        self.assertEqual(job_id, 99)
        self.assertTrue(is_new)

        # Verify branch insert received full country name "Egypt" and city "Cairo"
        branch_insert_call = mock_cursor.execute.call_args_list[3]
        self.assertEqual(branch_insert_call[0][1], (7, "Cairo", "Egypt"))

        # Verify job insert received industry, domains JSON, JobType, SeniorityLevel
        job_insert_call = mock_cursor.execute.call_args_list[4]
        params = job_insert_call[0][1]
        self.assertEqual(params[4], "VLSI & Hardware")
        self.assertEqual(json.loads(params[5]), ["VLSI", "RTL"])
        self.assertEqual(params[6], "fullTime")
        self.assertEqual(params[7], "senior")


if __name__ == "__main__":
    unittest.main()
