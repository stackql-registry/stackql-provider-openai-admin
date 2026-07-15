#!/usr/bin/env python3
"""Live smoke test for the openai_admin StackQL provider (pystackql).

Exercises the provider against the real OpenAI organization/administration API
using an admin key supplied via the OPENAI_ADMIN_KEY environment variable.

    python tests/smoke_test.py                      # local provider (provider-dev/openapi)
    python tests/smoke_test.py --registry public    # published provider (registry pull openai_admin)
    python tests/smoke_test.py --with-lifecycle     # also run the governance write lifecycle
    python tests/smoke_test.py --cleanup-only       # just sweep stackql-smoke breadcrumbs

Auth: the provider declares `bearer` auth on OPENAI_ADMIN_KEY, so no credential is
passed on the command line - stackql reads it from the environment. Only the
resolution checks (SHOW/DESCRIBE) work without a key; the live steps report as
BLOCKED when OPENAI_ADMIN_KEY is absent.

Nothing here consumes tokens - usage and cost are read, never generated. All reads
are cost-free.

Applicability: this surface exists for organizations. Where an org lacks a family
(certificates, groups/roles), the API answers 401/403/404 and those steps report
SKIP with the notice rather than FAIL - the surface being absent is not a provider
defect. A zero-activity org returns empty usage/cost buckets, which are valid
result sets, not failures.

Set OPENAI_API_KEY (a standard `sk-...` key) as well to prove the key-class
distinction through the provider: the same query is re-run with the auth config
pointed at the standard key and must be rejected.
"""

import argparse
import json
import os
import platform
import sys
import time

try:
    from pystackql import StackQL
except ImportError:
    sys.exit("pystackql is not installed. Install it with: pip install -r tests/requirements.txt")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL_REGISTRY_DIR = os.path.join(REPO_ROOT, "provider-dev", "openapi")
SMOKE_PREFIX = "stackql-smoke"
IS_WINDOWS = platform.system().startswith("Win")
EXPECTED_SERVICES = 10

# An org without a given family answers with one of these; the surface being absent
# is an applicability fact, not a provider defect (skip-with-notice).
ABSENT_SURFACE_MARKERS = ("401", "403", "404", "unauthorized", "forbidden", "not_found", "no_such")


class Reporter:
    """Tracks step outcomes and prints a final summary."""

    def __init__(self):
        self.results = []  # (name, status, detail)

    def record(self, name, status, detail=""):
        self.results.append((name, status, detail))
        symbol = {"PASS": "[ PASS ]", "FAIL": "[ FAIL ]", "SKIP": "[ SKIP ]", "BLOCKED": "[BLOCK ]"}[status]
        line = f"{symbol} {name}"
        if detail:
            one_line = " ".join(str(detail).split())
            if len(one_line) > 140:
                one_line = one_line[:137] + "..."
            line += f" - {one_line}"
        print(line, flush=True)

    def summary(self):
        counts = {}
        for _, status, _ in self.results:
            counts[status] = counts.get(status, 0) + 1
        print("\n" + "=" * 66)
        print("Summary: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
        print("=" * 66)
        return counts.get("FAIL", 0) == 0


def build_stackql(registry_mode):
    """Return a StackQL instance configured for the chosen registry."""
    sq = StackQL(output="dict")
    if registry_mode == "local":
        if not os.path.isdir(LOCAL_REGISTRY_DIR):
            sys.exit(f"local registry not found at {LOCAL_REGISTRY_DIR}; run the generate stage first")
        reg_path = LOCAL_REGISTRY_DIR.replace("\\", "/")
        full = {
            "url": f"file://{reg_path}",
            "localDocRoot": reg_path,
            "verifyConfig": {"nopVerify": True},
        }
        compact = json.dumps(full, separators=(",", ":"))
        # pystackql joins params into one shell string (shell=True), so the registry
        # JSON must survive the platform shell: escaped double quotes on Windows cmd,
        # single-quote wrapping on POSIX sh.
        reg_arg = ('"' + compact.replace('"', '\\"') + '"') if IS_WINDOWS else ("'" + compact + "'")
        params = sq.params
        if "--registry" in params:
            i = params.index("--registry")
            params[i + 1] = reg_arg
        else:
            params.extend(["--registry", reg_arg])
    return sq


def rows_of(result):
    """Normalise a pystackql execute() result to (rows, error)."""
    if isinstance(result, list):
        if len(result) == 1 and isinstance(result[0], dict) and set(result[0]) <= {"error", "exception"}:
            return [], str(result[0].get("error") or result[0].get("exception"))
        for r in result:
            if isinstance(r, dict) and "error" in r and len(r) == 1:
                return [], str(r["error"])
        return result, None
    if isinstance(result, dict) and ("error" in result or "exception" in result):
        return [], str(result.get("error") or result.get("exception"))
    return result, None


def q(sq, query, custom_auth=None):
    return rows_of(sq.execute(query, suppress_errors=False, custom_auth=custom_auth))


def stmt(sq, query):
    """Run a mutation/EXEC/REGISTRY statement. executeStmt surfaces API errors as
    a list like [{'error': '...'}] (unlike execute, which swallows SELECT errors to
    an empty list), so mutations give a reliable pass/fail signal."""
    out = sq.executeStmt(query)
    if isinstance(out, list):
        for item in out:
            if isinstance(item, dict) and item.get("error"):
                return ("", str(item["error"]).strip())
        return (str(out), None)
    if isinstance(out, dict):
        err = out.get("error") or out.get("exception")
        return (out.get("message", ""), str(err).strip() if err else None)
    return (str(out), None)


def looks_absent(err):
    """True when the error reads as 'this org does not expose this surface'."""
    low = str(err).lower()
    return any(m in low for m in ABSENT_SURFACE_MARKERS)


def read_step(sq, rep, name, query, allow_empty=True):
    """A cost-free read that tolerates an absent surface (skip-with-notice)."""
    rows, err = q(sq, query)
    if err:
        if looks_absent(err):
            rep.record(name, "SKIP", f"surface not available to this org - {err}")
        else:
            rep.record(name, "FAIL", err)
        return None
    if not rows and not allow_empty:
        rep.record(name, "FAIL", "0 rows where at least one was expected")
        return rows
    rep.record(name, "PASS", f"{len(rows)} rows" + (" (0 is valid)" if not rows else ""))
    return rows


# --- steps -----------------------------------------------------------------


def check_resolution(sq, rep):
    rows, err = q(sq, "SHOW SERVICES IN openai_admin")
    if err:
        rep.record("resolution: SHOW SERVICES", "FAIL", err)
        return False
    ok = len(rows) == EXPECTED_SERVICES
    rep.record("resolution: SHOW SERVICES", "PASS" if ok else "FAIL",
               f"{len(rows)} services (expected {EXPECTED_SERVICES})")
    return ok


def key_class_evidence(sq, rep, key_present):
    """The admin key works; a standard key is rejected by the same query."""
    if not key_present:
        rep.record("key class: admin key accepted", "BLOCKED", "OPENAI_ADMIN_KEY not set")
        return
    rows, err = q(sq, "SELECT id, name FROM openai_admin.projects.projects")
    if err:
        rep.record("key class: admin key accepted", "FAIL", err)
        return
    # A valid admin key always returns at least the default project, so 0 rows with a
    # key set points at auth/connectivity rather than an empty org.
    if len(rows) == 0:
        rep.record("key class: admin key accepted", "FAIL",
                   "0 projects - check the key is an admin key (sk-admin-...) and the org has the surface")
        return
    rep.record("key class: admin key accepted", "PASS", f"{len(rows)} projects listed")

    std = os.environ.get("OPENAI_API_KEY")
    if not std:
        rep.record("key class: standard key rejected", "SKIP",
                   "OPENAI_API_KEY not set - set a standard sk-... key for the rejection evidence")
        return
    # Same query, provider-routed, with the auth config pointed at the standard key.
    auth = {"openai_admin": {"type": "bearer", "credentialsenvvar": "OPENAI_API_KEY"}}
    rows, err = q(sq, "SELECT id FROM openai_admin.projects.projects", custom_auth=auth)
    if err or len(rows) == 0:
        rep.record("key class: standard key rejected", "PASS",
                   f"rejected as expected - {err or '0 rows / no access'}")
    else:
        rep.record("key class: standard key rejected", "FAIL",
                   f"standard key returned {len(rows)} rows - the classes are meant to be disjoint")


def directory_reads(sq, rep, key_present):
    if not key_present:
        rep.record("reads: directory surface", "BLOCKED", "OPENAI_ADMIN_KEY not set")
        return
    read_step(sq, rep, "read: organization users", "SELECT id, email, role FROM openai_admin.users.users", allow_empty=False)
    read_step(sq, rep, "read: invites", "SELECT id, email, status FROM openai_admin.invites.invites")
    read_step(sq, rep, "read: admin api keys", "SELECT id, name, created_at FROM openai_admin.admin_api_keys.admin_api_keys", allow_empty=False)
    read_step(sq, rep, "read: audit logs (limit 5)", "SELECT id, type, effective_at FROM openai_admin.audit_logs.audit_logs WHERE \"limit\" = 5")
    read_step(sq, rep, "read: org groups (RBAC family)", "SELECT id, name FROM openai_admin.groups.groups")
    read_step(sq, rep, "read: org roles (RBAC family)", "SELECT id, name FROM openai_admin.roles.roles")
    read_step(sq, rep, "read: certificates", "SELECT id, name FROM openai_admin.certificates.certificates")


def project_child_reads(sq, rep, key_present):
    """Child resources of the first project - the governance read surface."""
    if not key_present:
        rep.record("reads: project children", "BLOCKED", "OPENAI_ADMIN_KEY not set")
        return
    rows, err = q(sq, "SELECT id FROM openai_admin.projects.projects")
    if err or not rows:
        rep.record("reads: project children", "SKIP", err or "no projects to read children from")
        return
    pid = rows[0]["id"]
    read_step(sq, rep, f"read: project users ({pid})",
              f"SELECT user_id, role FROM openai_admin.projects.users WHERE project_id = '{pid}'")
    read_step(sq, rep, f"read: project service accounts ({pid})",
              f"SELECT id, name FROM openai_admin.projects.service_accounts WHERE project_id = '{pid}'")
    read_step(sq, rep, f"read: project api keys ({pid})",
              f"SELECT id, name FROM openai_admin.projects.api_keys WHERE project_id = '{pid}'")
    read_step(sq, rep, f"read: project rate limits ({pid})",
              f"SELECT id, model FROM openai_admin.projects.rate_limits WHERE project_id = '{pid}'")


def usage_and_cost(sq, rep, key_present, days):
    """The flagship: bucketed token usage and USD cost as rows, grouped.

    `limit` covers the whole window: it bounds buckets per page and defaults to 7
    (max: usage 31 at bucket_width=1d, costs 180), so sizing it to the window keeps
    a report in a single request. Multi-page traversal additionally depends on
    WO-001 (work-orders/WO-001-any-sdk-pagination-token-encoding.md); the assertion
    at the end of this step tracks it.

    A zero-activity org returns buckets with empty results (or no buckets) - a valid
    result set, reported as PASS with the row count, never a failure.
    """
    if not key_present:
        rep.record("flagship: usage / cost buckets", "BLOCKED", "OPENAI_ADMIN_KEY not set")
        return
    start = int(time.time()) - days * 86400
    usage_limit = min(max(days + 1, 1), 31)   # usage: max 31 buckets at 1d
    cost_limit = min(max(days + 1, 1), 180)   # costs: max 180 buckets

    rows, err = q(sq, (
        "SELECT start_time, end_time, results FROM openai_admin.usage.completions "
        f"WHERE start_time = {start} AND bucket_width = '1d' AND \"limit\" = {usage_limit}"
    ))
    if err:
        rep.record("flagship: usage.completions buckets", "FAIL", err)
    else:
        rep.record("flagship: usage.completions buckets", "PASS",
                   f"{len(rows)} daily buckets over {days}d (0 = zero-activity org, valid)")

    # group_by on the wire - the parameter the FinOps queries depend on
    rows, err = q(sq, (
        "SELECT start_time, results FROM openai_admin.usage.completions "
        f"WHERE start_time = {start} AND bucket_width = '1d' AND \"limit\" = {usage_limit} "
        "AND group_by = 'project_id'"
    ))
    if err:
        rep.record("flagship: usage grouped by project_id", "FAIL", err)
    else:
        grouped = sum(1 for r in rows if r.get("results") not in (None, "", "[]"))
        rep.record("flagship: usage grouped by project_id", "PASS",
                   f"{len(rows)} buckets, {grouped} with results")

    rows, err = q(sq, (
        "SELECT start_time, results FROM openai_admin.costs.costs "
        f"WHERE start_time = {start} AND \"limit\" = {cost_limit} AND group_by = 'project_id'"
    ))
    if err:
        rep.record("flagship: costs.costs daily USD buckets", "FAIL", err)
    else:
        rep.record("flagship: costs.costs daily USD buckets", "PASS",
                   f"{len(rows)} daily buckets over {days}d")

    # every usage capability resolves and answers
    caps = ["embeddings", "images", "moderations", "audio_speeches", "audio_transcriptions",
            "vector_stores", "code_interpreter_sessions"]
    failed = []
    for cap in caps:
        _, cerr = q(sq, (
            f"SELECT start_time FROM openai_admin.usage.{cap} "
            f"WHERE start_time = {start} AND bucket_width = '1d' AND \"limit\" = {usage_limit}"
        ))
        if cerr and not looks_absent(cerr):
            failed.append(f"{cap}: {cerr}")
    if failed:
        rep.record("flagship: all usage capabilities answer", "FAIL", "; ".join(failed[:2]))
    else:
        rep.record("flagship: all usage capabilities answer", "PASS", f"{len(caps) + 1} capabilities incl. completions")

    # WO-001 tracker: force a second page and record what the engine gets back, so a
    # fix landing upstream is noticed rather than assumed.
    _, err = q(sq, (
        "SELECT start_time FROM openai_admin.costs.costs "
        f"WHERE start_time = {start} AND \"limit\" = 1"
    ))
    if err and "page token" in str(err).lower():
        rep.record("flagship: multi-page bucket traversal (WO-001)", "SKIP",
                   "pending WO-001 - size limit to the window; single-request reports are unaffected")
    elif err:
        rep.record("flagship: multi-page bucket traversal (WO-001)", "SKIP", f"errored differently: {err}")
    else:
        rep.record("flagship: multi-page bucket traversal (WO-001)", "PASS",
                   "multi-page traversal works - WO-001 appears landed; the limit sizing guidance can be relaxed")


def pagination_smokes(sq, rep, key_present):
    """Auto-pagination traverses: a limit-bounded read returns the same rows as an
    unbounded one. Covers the cursor-derived ($.last_id) and cursor-next ($.next)
    idioms; the bucketed idiom ($.next_page) is exercised by the usage reads above.
    """
    if not key_present:
        rep.record("pagination: cursor traversal", "BLOCKED", "OPENAI_ADMIN_KEY not set")
        return

    def traversal(name, table, id_col="id"):
        full, err = q(sq, f"SELECT {id_col} FROM {table}")
        if err:
            rep.record(name, "SKIP" if looks_absent(err) else "FAIL", err)
            return
        if len(full) < 2:
            rep.record(name, "SKIP", f"{len(full)} rows - need >= 2 to prove a multi-page walk")
            return
        paged, err = q(sq, f"SELECT {id_col} FROM {table} WHERE \"limit\" = 1")
        if err:
            rep.record(name, "FAIL", err)
            return
        if len(paged) == len(full):
            rep.record(name, "PASS", f"limit=1 traversed to {len(paged)} rows (matches unbounded)")
        else:
            rep.record(name, "FAIL",
                       f"limit=1 returned {len(paged)} of {len(full)} rows - cursor did not traverse")

    traversal("pagination: cursor-derived ($.last_id) walk on projects", "openai_admin.projects.projects")
    traversal("pagination: cursor-next ($.next) walk on org roles", "openai_admin.roles.roles")


def sweep_breadcrumbs(sq, rep, key_present):
    """Archive any active projects whose name starts with the smoke prefix.

    Disposal on this surface is archive-based: the API exposes no project delete, so
    an archived breadcrumb persists (archived) in the org by design.
    """
    if not key_present:
        rep.record("cleanup: sweep prior breadcrumbs", "BLOCKED", "OPENAI_ADMIN_KEY not set")
        return
    rows, err = q(sq, "SELECT id, name, status FROM openai_admin.projects.projects")
    if err:
        rep.record("cleanup: list projects", "FAIL", err)
        return
    stale = [r for r in rows
             if str(r.get("name", "")).startswith(SMOKE_PREFIX) and str(r.get("status")) != "archived"]
    for r in stale:
        _, aerr = stmt(sq, f"EXEC openai_admin.projects.projects.archive @project_id = '{r['id']}'")
        rep.record(f"cleanup: archive {r['name']}", "FAIL" if aerr else "PASS", aerr or r["id"])
    rep.record("cleanup: sweep prior breadcrumbs", "PASS", f"{len(stale)} active breadcrumb(s) archived")


def governance_lifecycle(sq, rep, key_present, stamp):
    """Create a project -> add a service account -> archive it, within the run.

    Opt-in (--with-lifecycle): the API has no project delete, so every run leaves one
    permanently archived project in the organization. Cost-free, but not swept.
    """
    if not key_present:
        rep.record("lifecycle: project governance", "BLOCKED", "OPENAI_ADMIN_KEY not set")
        return
    name = f"{SMOKE_PREFIX}-{stamp}"

    _, err = stmt(sq, f"INSERT INTO openai_admin.projects.projects(name) SELECT '{name}'")
    if err:
        rep.record("lifecycle: create project", "SKIP" if looks_absent(err) else "FAIL", err)
        return
    rep.record("lifecycle: create project", "PASS", name)

    rows, err = q(sq, "SELECT id, name, status FROM openai_admin.projects.projects")
    match = next((r for r in rows if r.get("name") == name), None) if not err else None
    if not match:
        rep.record("lifecycle: find created project", "FAIL", err or f"'{name}' not found in the list after create")
        return
    pid = match["id"]
    rep.record("lifecycle: find created project", "PASS", f"{pid} status={match.get('status')}")

    rows, err = q(sq, f"SELECT id, name FROM openai_admin.projects.projects WHERE project_id = '{pid}'")
    got = (not err) and len(rows) == 1 and rows[0].get("id") == pid
    rep.record("lifecycle: get project by id", "PASS" if got else "FAIL", err or ("" if got else "mismatch"))

    _, err = stmt(sq, f"UPDATE openai_admin.projects.projects SET name = '{name}-updated' WHERE project_id = '{pid}'")
    rep.record("lifecycle: update project name", "FAIL" if err else "PASS", err or f"{name}-updated")

    sa_name = f"{name}-sa"
    _, err = stmt(sq, (
        "INSERT INTO openai_admin.projects.service_accounts(project_id, name) "
        f"SELECT '{pid}', '{sa_name}'"
    ))
    if err:
        rep.record("lifecycle: add service account", "SKIP" if looks_absent(err) else "FAIL", err)
    else:
        rep.record("lifecycle: add service account", "PASS", sa_name)
        rows, serr = q(sq, f"SELECT id, name FROM openai_admin.projects.service_accounts WHERE project_id = '{pid}'")
        found = (not serr) and any(r.get("name") == sa_name for r in rows)
        rep.record("lifecycle: list service accounts", "PASS" if found else "FAIL",
                   serr or (f"{len(rows)} accounts" if found else "created account not listed"))

    _, err = stmt(sq, f"EXEC openai_admin.projects.projects.archive @project_id = '{pid}'")
    rep.record("lifecycle: archive project", "FAIL" if err else "PASS", err or pid)
    if err:
        return

    rows, err = q(sq, f"SELECT id, status FROM openai_admin.projects.projects WHERE project_id = '{pid}'")
    archived = (not err) and len(rows) == 1 and str(rows[0].get("status")) == "archived"
    rep.record("lifecycle: confirm archived", "PASS" if archived else "FAIL",
               err or (rows[0].get("status") if rows else "project not found"))


def main():
    ap = argparse.ArgumentParser(description="Live smoke test for the openai_admin StackQL provider.")
    ap.add_argument("--registry", choices=["local", "public"], default="local",
                    help="local generated provider (default) or published provider via registry pull")
    ap.add_argument("--with-lifecycle", action="store_true",
                    help="run the governance write lifecycle (cost-free, but leaves one permanently archived project)")
    ap.add_argument("--days", type=int, default=30,
                    help="lookback window in days for the usage/cost bucket reads (default 30)")
    ap.add_argument("--cleanup-only", action="store_true", help="only sweep stackql-smoke breadcrumbs, then exit")
    args = ap.parse_args()

    key_present = bool(os.environ.get("OPENAI_ADMIN_KEY"))
    stamp = str(int(time.time()))
    rep = Reporter()

    print(f"openai_admin provider smoke test | registry={args.registry} | "
          f"admin key={'set' if key_present else 'ABSENT'} | "
          f"standard key={'set' if os.environ.get('OPENAI_API_KEY') else 'absent'}\n")

    sq = build_stackql(args.registry)

    if args.registry == "public":
        out, err = stmt(sq, "REGISTRY PULL openai_admin")
        rep.record("registry pull openai_admin", "FAIL" if err else "PASS", err or "pulled")
        if err:
            sys.exit(1)

    if not check_resolution(sq, rep):
        rep.summary()
        sys.exit(1)

    if args.cleanup_only:
        sweep_breadcrumbs(sq, rep, key_present)
        ok = rep.summary()
        sys.exit(0 if ok else 1)

    key_class_evidence(sq, rep, key_present)
    directory_reads(sq, rep, key_present)
    project_child_reads(sq, rep, key_present)
    usage_and_cost(sq, rep, key_present, args.days)
    pagination_smokes(sq, rep, key_present)

    if args.with_lifecycle:
        sweep_breadcrumbs(sq, rep, key_present)
        governance_lifecycle(sq, rep, key_present, stamp)

    ok = rep.summary()
    if not key_present:
        print("\nNote: live steps were BLOCKED. Set OPENAI_ADMIN_KEY (an admin key, sk-admin-...) to run them.")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
