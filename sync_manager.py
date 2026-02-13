import os
import subprocess

class SyncManager:
    def __init__(self, repo_url="https://github.com/aliyabuz25/Moshi.git"):
        self.repo_url = repo_url
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.data_dir = os.path.join(self.base_dir, "datas")

    def run_cmd(self, cmd):
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=self.base_dir)
            return result.stdout.strip(), result.stderr.strip()
        except Exception as e:
            return None, str(e)

    def pull_global(self):
        """Pull latest dataset and brain from Github"""
        print("[Sync] Pulling latest knowledge from Global Brain...")
        # We use git fetch/merge to avoid overwriting local training if possible, 
        # but for weights we usually want the latest global one.
        stdout, stderr = self.run_cmd("git fetch origin main && git reset --hard origin/main")
        return stdout if not stderr else f"Error: {stderr}"

    def contribute_local(self):
        """Push local training data to Github"""
        print("[Sync] Contributing local insights to Global Brain...")
        self.run_cmd("git add datas/dataset.txt")
        stdout, stderr = self.run_cmd('git commit -m "Auto-contribute: Local training update" && git push origin main')
        return "Success" if not stderr else f"Push Error: {stderr}"

    def check_status(self):
        """Check if we are synced with origin"""
        stdout, stderr = self.run_cmd("git status -uno")
        if "up to date" in stdout:
            return "Synced"
        return "Updates Available"

sync_manager = SyncManager()
