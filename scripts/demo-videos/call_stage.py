"""Two phones on one stage: Sarah's therapist app (left) and Harper's patient app (right), live."""

W = "d:/tmp/medisense"
HOSTS = ["stage.demo.localhost", "sarah.demo.localhost", "harper.demo.localhost"]
FLAGS = [
    "--host-resolver-rules=" + ",".join(f"MAP {h} 127.0.0.1:3000" for h in HOSTS),
    "--unsafely-treat-insecure-origin-as-secure=" + ",".join(f"http://{h}" for h in HOSTS),
    "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks",
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--lang=en-AU",
]
STAGE_URL = "http://stage.demo.localhost/__stage"
LEFT = "http://sarah.demo.localhost"    # Sarah
RIGHT = "http://harper.demo.localhost"  # Harper: own host, own session, same site as the stage


def token(f):
    return [l.split("\t")[6].strip() for l in open(f"{W}/{f}") if "medisense_session" in l][0]


STAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Medisense video visit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<style>
  :root { --ink:#141414; --paper:#f4f1ea; }
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; background: radial-gradient(1200px 700px at 50% 0%, #1d3b34 0%, #0f1f1b 55%, #0a1512 100%); font-family: "Segoe UI", system-ui, sans-serif; color: #f4f1ea; overflow: hidden; }
  .top { position: absolute; top: 22px; left: 0; right: 0; text-align: center; }
  .eyebrow { font-size: 12px; letter-spacing: .28em; text-transform: uppercase; opacity: .65; }
  .title { font-family: Georgia, "Times New Roman", serif; font-size: 30px; margin-top: 4px; }
  .stage { position: absolute; top: 84px; left: 0; right: 0; display: flex; justify-content: center; gap: 120px; }
  .side { display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .who { display: flex; align-items: center; gap: 10px; font-size: 14px; }
  .who b { font-size: 15px; }
  .pill { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; padding: 4px 10px; border-radius: 99px; background: rgba(244,241,234,.12); }
  .phone { width: 368px; height: 648px; border-radius: 54px; padding: 11px; background: #0b0b0b;
           box-shadow: 0 0 0 2px #2b2b2b, 0 30px 80px rgba(0,0,0,.55); position: relative; transition: box-shadow .4s; }
  .phone.active { box-shadow: 0 0 0 2px #2b2b2b, 0 0 0 7px rgba(126,214,180,.55), 0 30px 80px rgba(0,0,0,.55); }
  .phone iframe { width: 346px; height: 626px; border: 0; border-radius: 44px; background: var(--paper); display: block; }
  .link { position: absolute; top: 400px; left: 50%; transform: translateX(-50%); width: 120px; text-align: center; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; opacity: .55; }
  .link .line { height: 2px; margin: 8px 0; background: repeating-linear-gradient(90deg, rgba(244,241,234,.6) 0 6px, transparent 6px 12px); }
  .cap { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); max-width: 980px; min-height: 56px;
         display: flex; align-items: center; gap: 14px; padding: 14px 24px; border-radius: 16px;
         background: rgba(10,21,18,.86); border: 1px solid rgba(244,241,234,.14); font-size: 18px; line-height: 1.35;
         transition: opacity .35s; opacity: 0; }
  .cap.on { opacity: 1; }
  .cap .n { flex: none; font-weight: 700; color: #7ed6b4; font-size: 18px; }
  .cover { position: absolute; inset: 0; background: #0f1f1b; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 9; transition: opacity .8s; }
  .cover .t { font-family: Georgia, serif; font-size: 52px; margin-top: 10px; }
  .cover .s { margin-top: 12px; opacity: .7; font-size: 17px; }
</style></head><body>
<div class="top"><div class="eyebrow">Medisense · Telehealth</div><div class="title">A video visit, from both sides</div></div>
<div class="stage">
  <div class="side"><div class="who"><span class="pill">Therapist app</span><b>Sarah Thompson</b></div>
    <div class="phone" id="pl"><iframe id="L" allow="camera; microphone; display-capture; autoplay" src="about:blank"></iframe></div></div>
  <div class="side"><div class="who"><span class="pill">Patient app</span><b>Harper Nguyen</b></div>
    <div class="phone" id="pr"><iframe id="R" allow="camera; microphone; display-capture; autoplay" src="about:blank"></iframe></div></div>
</div>
<div class="link"><div class="line"></div>Same visit<br>live</div>
<div class="cap" id="cap"><span class="n" id="n"></span><span id="t"></span></div>
<div class="cover" id="cover"><div class="eyebrow">Medisense · Telehealth module</div><div class="t">Video visits</div>
  <div class="s">Therapist app and patient app, step by step</div></div>
</body></html>"""


def install(ctx, sarah, harper):
    """Each phone's host keeps its own session cookie; the stage page is served locally."""
    ctx.add_cookies([
        {"name": "medisense_session", "value": sarah, "url": LEFT},
        {"name": "medisense_session", "value": harper, "url": RIGHT},
    ])
    ctx.route(STAGE_URL, lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=STAGE))
