# UI

Linear-inspired frontend for the PM System API.

## Run

```bash
cd /Users/amanrai/Code/pmsystem/ui
npm install
npm run dev
```

The app expects the FastAPI backend at `http://127.0.0.1:8000/api` by default.

To override that:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000/api npm run dev
```
