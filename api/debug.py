from http.server import BaseHTTPRequestHandler
import json
import os
import sys

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            cwd = os.getcwd()
            files_cwd = os.listdir(cwd)
            
            data_dir = os.path.join(cwd, 'data')
            data_files = []
            if os.path.exists(data_dir):
                data_files = os.listdir(data_dir)
            
            api_dir = os.path.join(cwd, 'api')
            api_files = []
            if os.path.exists(api_dir):
                api_files = os.listdir(api_dir)
                
            env_vars = {k: v for k, v in os.environ.items() if 'KEY' not in k and 'SECRET' not in k and 'TOKEN' not in k}

            result = {
                'cwd': cwd,
                'files_cwd': files_cwd,
                'data_dir': data_dir,
                'data_files': data_files,
                'api_dir': api_dir,
                'api_files': api_files,
                'python_version': sys.version,
                'env': env_vars
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())
