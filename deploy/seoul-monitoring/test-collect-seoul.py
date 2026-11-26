import importlib.util
import json
import os
from pathlib import Path
import tempfile
from unittest.mock import patch

path = Path(__file__).with_name("collect-seoul.py")
spec = importlib.util.spec_from_file_location("collector", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def root_json(path, obj):
    path.write_text(json.dumps(obj))
    path.chmod(0o600)


def fixture_units(name):
    return (
        {"ActiveState": "active"} if name.endswith(".timer")
        else {"ActiveState": "inactive", "Result": "success"}
    )


with tempfile.TemporaryDirectory() as temp:
    base = Path(temp)
    r2 = base / "r2-daily"
    pg = base / "postgres-daily"
    dir_name = "20261126T041011Z"
    r2_generation = r2 / dir_name
    pg_generation = pg / "runs" / dir_name
    for item in (r2, r2_generation, pg, pg / "runs", pg_generation):
        item.mkdir(mode=0o700)
    (r2 / "latest").symlink_to(r2_generation.name)
    (pg / "latest").symlink_to(f"runs/{pg_generation.name}")
    root_json(r2 / "status.json", {"state": "failure", "at": "2026-11-27T03:21:40+08:00", "detail": "really-private"})
    root_json(pg / "status.json", {"status": "success", "lastAttemptAt": "2026-11-26T04:10:11Z", "lastSuccessAt": "2026-11-26T04:10:42Z", "lastError": "really-private"})
    root_json(r2_generation / "manifest.json", {"version": 1, "startedAt": "2026-11-26T04:10:11Z", "finishedAt": "2026-11-26T04:10:42.124Z", "buckets": ["really-private"]})
    root_json(pg_generation / "manifest.json", {"version": 1, "status": "complete", "generation": dir_name, "startedAt": "2026-11-26T04:10:11Z", "completedAt": "2026-11-26T04:10:42Z"})
    with (patch.object(module, "ROOT_UID", os.geteuid()),
          patch.object(module, "VAULT", base),
          patch.object(module, "systemd_unit", side_effect=fixture_units)):
        r2_values = module.collect_backup("r2")
        assert r2_values == {
            "attemptAt": "2026-11-26T19:21:40Z", "successAt": "2026-11-26T04:10:42Z",
            "result": "failed", "serviceActive": False, "timerActive": True,
        }, r2_values
        pg_values = module.collect_backup("postgres")
        assert pg_values["result"] == "success"
        assert pg_values["successAt"] == "2026-11-26T04:10:42Z"
        assert "really-private" not in json.dumps((r2_values, pg_values))
        (pg / "latest").unlink()
        (pg / "latest").symlink_to(str(pg_generation))
        assert module.collect_backup("postgres")["successAt"] is None
        (r2_generation / "manifest.json").chmod(0o644)
        assert module.collect_backup("r2")["successAt"] is None
        (r2_generation / "manifest.json").unlink()
        (r2_generation / "manifest.json").symlink_to(pg_generation / "manifest.json")
        assert module.collect_backup("r2")["successAt"] is None
    with patch.object(module, "VAULT", base / "missing"):
        with patch.object(module, "systemd_unit", return_value={}):
            assert all(value is None for value in module.collect_backup("postgres").values())

window = ("2026-11-26T11:17:00+08:00", "2026-11-26T11:55:00+08:00")
with patch.object(module, "read_command", return_value="10\n") as call:
    assert module.collect_canteen(()) is None
    assert module.collect_canteen(("not-a-time",)) is None
    assert module.collect_canteen(("2026-11-26T11:17:00Z", window[1])) is None
    assert module.collect_canteen((window[0], "2026-11-26T12:00:00+08:00")) is None
    call.assert_not_called()
    assert module.collect_canteen(window) == {
        "windowKey": "2026-11-26/lunch", "acceptedSources": 10, "status": "accepted",
    }
    args, kwargs = call.call_args
    assert args[0][1:3] == ["exec", "--interactive"]
    assert args[0][-5:] == ["node", "-", *window, "2026-11-26/lunch"]
    assert "'BEGIN READ ONLY'" in kwargs["sql"]
    assert "'ROLLBACK'" in kwargs["sql"]
    assert "count(DISTINCT snapshot.menu_source_id)" in kwargs["sql"]
    assert "$1::timestamptz" in kwargs["sql"]
    assert "process.env.DATABASE_URL" in kwargs["sql"]
    assert all("DATABASE_URL" not in arg for arg in args[0])
    call.return_value = "0\n"
    assert module.collect_canteen(window)["status"] == "none"
    call.return_value = "sensitive-output-must-not-be-printed"
    assert module.collect_canteen(window) == {
        "windowKey": "2026-11-26/lunch", "acceptedSources": None, "status": None,
    }
print("Backup path, failure, malformed/absent input, window, SQL and sanitized output checks passed")
