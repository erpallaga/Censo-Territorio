from http.server import BaseHTTPRequestHandler
import json
import os
import sys


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        file_dir = os.path.dirname(os.path.abspath(__file__))
        cwd = os.getcwd()

        info = {
            'cwd': cwd,
            '__file__': os.path.abspath(__file__),
            'file_dir': file_dir,
            'python_version': sys.version,
        }

        # List key directories
        for path in [cwd, file_dir, os.path.join(file_dir, '_shared'),
                     os.path.join(cwd, 'data'), os.path.join(file_dir, '..', 'data')]:
            path = os.path.normpath(path)
            try:
                info[f'ls:{path}'] = sorted(os.listdir(path))[:20]
            except Exception as e:
                info[f'ls:{path}'] = f'ERROR: {e}'

        # Check _shared and data from various locations
        info['_shared_in_file_dir'] = os.path.isdir(os.path.join(file_dir, '_shared'))
        info['data_in_cwd'] = os.path.isdir(os.path.join(cwd, 'data'))
        info['data_in_parent'] = os.path.isdir(os.path.join(file_dir, '..', 'data'))

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(info, indent=2).encode())
