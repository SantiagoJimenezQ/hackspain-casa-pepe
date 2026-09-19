# Agent latency measurement

The analyzer makes no network requests and performs no incident actions:

```sh
node demo/analyze-agent-latency.mjs /tmp/casa-pepe-runs.json
node --test demo/analyze-agent-latency.test.mjs
```

Input is `{ "runs": [{ "runIdentifier": "run_...", "profile": "baseline", "metadata": {}, "events": [] }] }`. Export every page of authenticated `/api/activity` for each run; do not include API keys in the file. Metadata should record commit plus whether the checkout is dirty, scenario/seed, model/reasoning settings, flags, adapter modes, fixed simulated completion delays and approval delay. Store captures/results outside the public repository.

The analyzer deduplicates by sequence, excludes other runs, reports first adapter dispatch (never plan save or approval creation), overlapping approval-wait union, matching approval-to-dispatch, capacity-change-to-revised-plan-dispatch, per-request commander model durations and failure/rejection/stale counts. Incomplete measurements are null. Capture until completion or an explicit failure; a partial export cannot establish success. Runs predating `tool-call.dispatched` cannot reconstruct that milestone and must be rerun.

Rehearse against simulated call/recovery/email adapters. Hold scenario, seed, provider profile and approval delays constant. Run at least 20 baseline and 20 optimized incidents, alternating profiles where practical; repeat for candidate reasoning settings. Keep failed runs in the summary. A 20-run p95 is directional evidence, not a production SLO. The target is at least 25% lower median incident-to-dispatch, no observed p95 regression and no incorrect capacity, dependency or approval behavior. No live-model improvement is claimed until those captures exist.

Recommended comparison:

| Profile | Combined flag | Compact flag |
| --- | --- | --- |
| baseline | false | false |
| combined | true | false |
| compact | true | true |

The scripted integration suite exercises all three profiles using real runtime services and in-memory repositories. It validates full recovery, capacity twists, rejected approvals and retained learning. This is deterministic orchestration evidence, not live model quality evidence. Do not use scripted model timings to choose a provider.
