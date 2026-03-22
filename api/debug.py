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
        }

        # List directories to understand the Lambda layout
        for label, path in [
            ('cwd', cwd),
            ('file_dir', file_dir),
            ('/var/task', '/var/task'),
            ('/var/task/api', '/var/task/api'),
            ('/var/task/data', '/var/task/data'),
        ]:
            try:
                info[f'ls({path})'] = sorted(os.listdir(path))[:30]
            except Exception as e:
                info[f'ls({path})'] = str(e)

        # Check _shared in multiple locations
        for candidate in [file_dir, os.path.join(file_dir, 'api'),
                          cwd, os.path.join(cwd, 'api')]:
            key = f'_shared_exists({candidate})'
            info[key] = os.path.isdir(os.path.join(candidate, '_shared'))

        # Check data/ in multiple locations
        for candidate in [file_dir, os.path.dirname(file_dir), cwd]:
            key = f'data_exists({candidate})'
            info[key] = os.path.isdir(os.path.join(candidate, 'data'))

        # Try importing _shared
        try:
            _dir = file_dir
            _candidate = _dir
            for _ in range(4):
                if os.path.isdir(os.path.join(_candidate, '_shared')):
                    sys.path.insert(0, _candidate)
                    break
                _parent = os.path.dirname(_candidate)
                if _parent == _candidate:
                    break
                _candidate = _parent

            from _shared.data_loader import get_city_data, _get_project_root
            info['import_shared'] = 'OK'
            info['project_root'] = _get_project_root()
            root = _get_project_root()
            try:
                info[f'ls({root}/data)'] = sorted(os.listdir(os.path.join(root, 'data')))[:20]
            except Exception as e:
                info[f'ls({root}/data)'] = str(e)
        except Exception as e:
            info['import_shared'] = f'FAILED: {e}'

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(info, indent=2).encode())
