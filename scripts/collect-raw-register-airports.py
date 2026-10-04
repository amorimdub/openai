"""Collect untouched Tusla county PDFs and OurAirports CSV; no record parsing."""
import importlib.util,json,re,urllib.parse,pathlib,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('raw',ROOT/'scripts'/'collect-raw-health-education.py'); mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
def collect_register():
    f=mod.BASE/'tusla-county-register'/mod.DATE;f.mkdir(parents=True,exist_ok=True)
    u='https://www.tusla.ie/services/preschool-services/early-years-providers/register-of-early-years-services-by-county/'
    m={'source':'tusla-county-register','snapshot_date':mod.DATE,'started_utc':mod.utc(),'scope':'Republic of Ireland','stage':'raw untouched source HTML and PDFs; only link discovery','source_reference_period':'county source URLs July26; reference period July2026 suggested by filenames and previously sampled Dublin cover; individual PDF records not parsed','reuse_status':'unverified: public accessibility does not establish PDF dataset reuse licence','local_only':True,'resources':[],'license_evidence':{'file':'register-page.html','url':u,'assessment':'no explicit PDF dataset reuse licence verified'},'completeness':{'status':'in_progress'}}
    try:
        b=mod.fetch(f,m,u,'register-page.html','original source page and PDF link evidence')
        links=[]
        for href in re.findall(r'href\s*=\s*[\"\x27]([^\"\x27]+)',b.decode('utf8',errors='replace'),re.I):
            url=urllib.parse.urljoin(u,href)
            if '.pdf' in url.lower() and url not in links: links.append(url)
        m['expected_file_count']=len(links);m['downloaded_file_count']=0;m['download_errors']=[]
        for url in links:
            name=urllib.parse.urlsplit(url).path.rsplit('/',1)[-1]
            try:
                mod.fetch(f,m,url,name,'original linked county register PDF')
                m['downloaded_file_count']+=1
            except Exception as e: m['download_errors'].append({'url':url,'error':str(e)})
            mod.save_manifest(f,m)
        m['expected_count']=None;m['downloaded_count']=None
        m['count_note']='Provider record counts deliberately not parsed from PDFs; completeness below concerns files linked by the source page.'
        m['completeness']={'status':'complete_linked_files' if len(links)==m['downloaded_file_count'] and not m['download_errors'] else 'partial','expected_pdf_count':len(links),'downloaded_pdf_count':m['downloaded_file_count'],'basis':'every unique PDF link on source landing page; provider records remain unparsed'}
    except Exception as e: m['completeness']={'status':'failed_or_partial','error':str(e)}
    m['completed_utc']=mod.utc();mod.save_manifest(f,m)
    print(json.dumps({'source':m['source'],'completeness':m['completeness'],'folder':str(f)}),flush=True)
def collect_airports():
    f=mod.BASE/'ourairports-ireland'/mod.DATE;f.mkdir(parents=True,exist_ok=True)
    m={'source':'ourairports-ireland','snapshot_date':mod.DATE,'started_utc':mod.utc(),'scope':'Republic of Ireland country export','stage':'raw original CSV and licence/source HTML; no CSV record parsing','source_reference_period':'download snapshot only; individual airport observation dates vary and are deliberately not parsed in this collection','reuse_status':'publisher states all data public domain; community data without accuracy guarantee, not Irish official government dataset','local_only':True,'resources':[],'expected_count':None,'downloaded_count':None,'count_note':'CSV rows deliberately not parsed at this stage; prior research counted137 but that count is not independently rechecked for this new snapshot','license_evidence':{'file':'data-page.html','url':'https://ourairports.com/data/','assessment':'publisher public-domain statement'},'completeness':{'status':'in_progress'}}
    try:
        mod.fetch(f,m,'https://ourairports.com/data/','data-page.html','original publisher documentation and public-domain licence evidence')
        mod.fetch(f,m,'https://ourairports.com/countries/IE/airports.csv','airports.csv','original full Ireland country CSV')
        m['completeness']={'status':'complete_download','basis':'HTTP200 full response saved with bytes/checksum; CSV row completeness deliberately not parsed'}
    except Exception as e: m['completeness']={'status':'failed_or_partial','error':str(e)}
    m['completed_utc']=mod.utc();mod.save_manifest(f,m)
    print(json.dumps({'source':m['source'],'completeness':m['completeness'],'folder':str(f)}),flush=True)
if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description='Collect original Tusla registers and Ireland airport CSV without record parsing.')
    parser.add_argument('--snapshot-date',default=mod.DATE,type=lambda value:datetime.date.fromisoformat(value).isoformat(),help='ISO snapshot folder date; defaults to current UTC date')
    parser.add_argument('--output-root',type=pathlib.Path,default=mod.BASE,help='Raw source root; defaults to repository data/raw')
    args=parser.parse_args()
    mod.DATE=args.snapshot_date
    mod.BASE=args.output_root.resolve()
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        list(ex.map(lambda fn:fn(),[collect_register,collect_airports]))
