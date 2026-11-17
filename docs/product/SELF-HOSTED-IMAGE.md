# Self-hosted image server: clearing its own copies (spec 002 FR-125)

The app deletes photos and derived images from its own storage. A ComfyUI server keeps its own
copy of every reference image it receives (`input/`) and every image it makes (`output/`), and
the app cannot reach those folders. Clear them on a schedule shorter than any retention period
the app promises. One hour is enough, because the app stores the result as soon as a panel is
rendered.

**Not yet tried on a real server.** Check the paths on your installation first.

```cron
# Every 15 minutes: remove ComfyUI inputs and outputs older than 60 minutes.
*/15 * * * * find /opt/ComfyUI/input /opt/ComfyUI/output -type f -mmin +60 -delete
```

Keep the server's own logs free of prompts, and never back up `input/` or `output/`.
