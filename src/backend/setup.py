#!/usr/bin/env python
import os
from typing import List

from setuptools import find_packages, setup  # version 67.0.0

# Global constants
PACKAGE_NAME = "fantasy-gm-assistant-backend"
VERSION = "1.0.0"
DESCRIPTION = "AI-Powered Fantasy Sports GM Assistant Backend Service"
AUTHOR = "Fantasy GM Assistant Team"
AUTHOR_EMAIL = "team@fantasygm.com"
PYTHON_REQUIRES = ">=3.11,<4.0"

# Project URLs
PROJECT_URLS = {
    "Homepage": "https://github.com/fantasygm/backend",
    "Documentation": "https://docs.fantasygm.com",
    "Bug Tracker": "https://github.com/fantasygm/backend/issues",
}

def read_requirements(req_type: str) -> List[str]:
    """
    Read and parse package dependencies from requirements.txt file.
    
    Args:
        req_type: Type of requirements to read (base, dev, test, docs)
        
    Returns:
        List of package requirements with version specifications
    """
    requirements = []
    filename = f"requirements-{req_type}.txt" if req_type != "base" else "requirements.txt"
    req_path = os.path.join(os.path.dirname(__file__), filename)
    
    if os.path.exists(req_path):
        with open(req_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    requirements.append(line)
    
    return requirements

def read_long_description() -> str:
    """
    Read the long description from README.md file for PyPI documentation.
    
    Returns:
        Project long description in markdown format
    """
    with open("README.md", "r", encoding="utf-8") as f:
        return f.read()

setup(
    # Package metadata
    name=PACKAGE_NAME,
    version=VERSION,
    description=DESCRIPTION,
    long_description=read_long_description(),
    long_description_content_type="text/markdown",
    author=AUTHOR,
    author_email=AUTHOR_EMAIL,
    python_requires=PYTHON_REQUIRES,
    url=PROJECT_URLS["Homepage"],
    project_urls=PROJECT_URLS,
    
    # Package configuration
    packages=find_packages(where="src/backend"),
    package_dir={"": "src/backend"},
    include_package_data=True,
    zip_safe=False,
    
    # Dependencies
    install_requires=read_requirements("base"),
    extras_require={
        "dev": read_requirements("dev"),
        "test": read_requirements("test"),
        "docs": read_requirements("docs"),
    },
    
    # Entry points
    entry_points={
        "console_scripts": [
            "fantasy-gm=app.main:main",
        ],
    },
    
    # Package classifiers
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3.11",
        "Operating System :: OS Independent",
        "Framework :: FastAPI",
        "Topic :: Software Development :: Libraries :: Application Frameworks",
        "Topic :: Internet :: WWW/HTTP :: HTTP Servers",
        "Topic :: Internet :: WWW/HTTP :: Dynamic Content",
    ],
    
    # Package discovery
    package_data={
        "": ["py.typed", "*.json", "*.yaml"],
    },
    
    # Build configuration
    setup_requires=[
        "wheel>=0.40.0",
        "setuptools>=67.0.0",
    ],
)