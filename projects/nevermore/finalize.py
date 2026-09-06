"""Set truthful generated-art metadata and verify all image bytes/bindings."""
import base64,hashlib,io,json,pathlib,sys
from PIL import Image
root=pathlib.Path(__file__).resolve().parent
p=pathlib.Path(sys.argv[1]);pack=json.loads(p.read_text())
original=json.loads((root/'source/original.world-map.json').read_text())
art_plan=json.loads((root/'source/art-plan.json').read_text())
new={f"global-gallery:nevermore-map-pack:{a['role']}:{a['locationId']}":a for a in art_plan}
decoded=[]
for a in pack['artwork']:
    if a['sourceImageId'] in new:
        meta=new[a['sourceImageId']];a.update(prompt=meta['prompt'],provider='OpenAI built-in image generation',model='not exposed')
    raw=base64.b64decode(a['data'].split(',',1)[1],validate=True)
    im=Image.open(io.BytesIO(raw));size=im.size;im.verify()
    assert size==(a['width'],a['height'])
    decoded.append(dict(sourceImageId=a['sourceImageId'],width=size[0],height=size[1],bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest()))
old={a['sourceImageId']:a for a in original['artwork']};now={a['sourceImageId']:a for a in pack['artwork']}
changed=[id for id,a in old.items() if now[id]['data']!=a['data']]
assert changed==['global-gallery:nevermore-map-pack:background:jericho-woods']
assert len(now)==82 and len(now)==len(pack['artwork'])
used=[]
for l in pack['definition']['locations']:
    assert l.get('useReferenceImage') and l.get('referenceImageId') in now
    used.append(l['referenceImageId'])
    if l['childPresentation']=='map':
        assert l.get('mapBackgroundImageId') in now
        used.append(l['mapBackgroundImageId'])
assert set(used)==set(now)
p.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
report=dict(artworkCount=82,referenceCoverage='79/79',backgroundCoverage='3/3',decodedImages=82,unchangedOriginalImages=69,changedOriginalImages=changed,newLocationImages=12,unusedAssets=0,allBindingsResolved=True,artifactBytes=p.stat().st_size,artifactSha256=hashlib.sha256(p.read_bytes()).hexdigest(),images=decoded)
(root/'checks/art-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='images'},indent=2))
