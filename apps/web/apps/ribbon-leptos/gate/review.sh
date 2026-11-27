#!/usr/bin/env bash
# Gate: ribbon/ops "review" — honest Errs for what the engine lacks (track changes, comments,
# compare, mail merge, chat, encrypt) and the protect-document restriction toggle proven against
# the ENGINE (window.woReviewProbe) and against typing after protecting (one consistent pair).
cd "$(git rev-parse --show-toplevel)" && bash apps/web/apps/ribbon-leptos/gate/common.sh apps/web/apps/ribbon-leptos/gate/review.cjs
