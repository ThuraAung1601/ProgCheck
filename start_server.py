#!/usr/bin/env python
"""Simple wrapper to start the ProgCheck backend server"""
import os
import sys
import subprocess
from pathlib import Path

# Get the project root
ROOT = Path(__file__).resolve().parent

# Change to the project root directory
os.chdir(ROOT)

# Add to Python path
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Start uvicorn
subprocess.run(
    [sys.executable, '-m', 'uvicorn', 'webui.main:app', '--host', '127.0.0.1', '--port', '8000', '--reload'],
    cwd=ROOT
)
