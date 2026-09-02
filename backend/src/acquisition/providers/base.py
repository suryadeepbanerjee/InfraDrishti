import logging
from abc import ABC, abstractmethod
from pathlib import Path

logger = logging.getLogger(__name__)

class BaseProvider(ABC):
    def __init__(self, workspace, config=None):
        self.workspace = workspace
        self.config = config or {}
        
    @abstractmethod
    def discover(self):
        """Discover required tiles based on workspace AOI"""
        raise NotImplementedError
        
    @abstractmethod
    def download(self):
        """Download missing tiles to workspace raw_dir, or link from local cache if in DEVELOPMENT mode"""
        raise NotImplementedError
        
    @abstractmethod
    def validate(self):
        """Validate downloaded files"""
        raise NotImplementedError
        
    @abstractmethod
    def get_paths(self):
        """Return list of valid file paths for the preprocessor"""
        raise NotImplementedError
        
    def _add_manifest_entry(self, dataset_name, source_url, downloaded_files, temporary=True):
        entry = {
            "dataset": dataset_name,
            "source": source_url,
            "downloaded_files": [str(p) for p in downloaded_files],
            "temporary": temporary
        }
        self.workspace.manifest['datasets'].append(entry)
        self.workspace.save_manifest()

