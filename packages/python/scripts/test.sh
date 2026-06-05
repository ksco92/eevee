#!/bin/sh

set -ex

python3 -m pytest tests/ --cov=src/flexdataset --cov-fail-under=95
