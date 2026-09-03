import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import D3GeographicMap from './components/D3GeographicMap'
import { MUN_BY_REGIONAL, REGIONAIS } from './data/aredMapData'
import type { Enrollment, EtecPoint, SnapshotSeries } from './data/mockData'

type Filters={regional:string[];city:string[];etec:string[];axis:string[];course:string[];period:string[]}; type FilterKey=keyof Filters
type OfferStatus='comfortable'|'attention'|'low'
type RegionalStatus=OfferStatus|'unavailable'
type PerformanceSortKey='regional'|'total'|'paid'|'conversion'|'demand'|'situation'
type AnalysisScope={presential:boolean;ead:boolean;trainees:boolean}
type DashboardPayload={etecs:EtecPoint[];snapshotSeries:SnapshotSeries[]}
const initialFilters:Filters={regional:[],city:[],etec:[],axis:[],course:[],period:[]}; const number=new Intl.NumberFormat('pt-BR')
const exemptionMetrics: { inscritos_com_isencao: number } | null = null
const apiBaseUrl=(import.meta.env.VITE_API_BASE_URL??'').replace(/\/$/,'')
const apiUrl=(path:string)=>`${apiBaseUrl}${path}`
const readJson=async<T,>(response:Response):Promise<T>=>{const text=await response.text();if(!text)return {} as T;try{return JSON.parse(text) as T}catch{throw new Error(response.ok?'O servidor respondeu em um formato inválido.':text)}}
const formatSnapshotDate=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
const normalizeName=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const compactCourseName=(value:string)=>value.replace(/^Ensino Médio com Habilitação Profissional de Técnico em\s+/i,'EM Técnico em ').replace(/^Ensino Médio com Habilitação Profissional\s+/i,'EM Profissional ')
const chartCourseName=(value:string)=>compactCourseName(value).replace(/Técnico em\s+/i,'')
const formatEtecLabel=(etec:EtecPoint)=>{const code=etec.name.split('.')[0].replace(/^E0*/i,'').padStart(3,'0');const name=etec.label.replace(/\s*\([^)]*\)\s*$/,'').replace(/^Etec\s+/i,'');return `${code} - ${name}`}
const mapRegionalByMunicipality=new Map(Object.entries(MUN_BY_REGIONAL).flatMap(([regional,data])=>data.features.map(feature=>[normalizeName(String(feature.properties.name??'')),regional])))
const mapRegionalFallbackByMunicipality=new Map([['campinas','Campinas Sul']])
type HistoryPoint={referenceAt:string;total:number;paid:number;unpaid:number;trainee:number;regular:number;vacancies:number}; type ChartData=Enrollment[]&{history?:HistoryPoint[]}
type CoursePeriod='all'|'morning'|'afternoon'|'night'
type CourseRow={course:string;paid:number;unpaid:number;vacancies:number}
const offerStatusFor=(item:Enrollment):OfferStatus=>{const demand=item.vacancies?(item.paid+item.unpaid)/item.vacancies:0;return demand>=1.5?'comfortable':demand>=1?'attention':'low'}
const situationFor=(regular:number,vacancies:number):RegionalStatus=>!vacancies?'unavailable':regular/vacancies>=1.5?'comfortable':regular/vacancies>=1?'attention':'low'
const situationLabel=(status:RegionalStatus)=>status==='comfortable'?'Confortável':status==='attention'?'Atenção':status==='low'?'Baixa demanda':'Sem vagas'
const matchesCoursePeriod=(period:string,scope:CoursePeriod)=>scope==='all'||normalizeName(period).includes(scope==='morning'?'manha':scope==='afternoon'?'tarde':'noite')
function ActionIcon({name}:{name:'copy'|'whatsapp'|'import'}){
 if(name==='copy')return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="7" width="11" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></svg>
 if(name==='whatsapp')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z"/><path d="M9 8.2c.3-.6.6-.6.9-.6h.4c.2 0 .4.1.5.4l.7 1.6c.1.3.1.5-.1.7l-.5.6c.7 1.3 1.6 2.2 2.9 2.9l.6-.5c.2-.2.4-.2.7-.1l1.6.7c.3.1.4.3.4.5v.4c0 .3 0 .6-.6.9-.4.2-1 .3-1.6.1-2.2-.7-4.6-3.1-5.3-5.3-.2-.6-.1-1.2.1-1.6Z"/></svg>
 return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4"/><path d="m8 8 4-4 4 4"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>
}
function CourseRowTrack({paid,unpaid,demand,paidWidth,totalWidth,children}:{paid:number;unpaid:number;demand:number;paidWidth:number;totalWidth:number;children:ReactNode}){
 const trackRef=useRef<HTMLSpanElement>(null); const [width,setWidth]=useState(0)
 useEffect(()=>{const track=trackRef.current;if(!track)return undefined;const update=()=>setWidth(track.clientWidth);const observer=new ResizeObserver(update);observer.observe(track);update();return()=>observer.disconnect()},[])
 const paidLabel=number.format(paid); const unpaidLabel=number.format(unpaid); const demandLabel=`${demand.toFixed(1).replace('.',',')}x`; const paidFits=paidWidth/100*width>=Math.max(42,paidLabel.length*7+14); const unpaidFits=(totalWidth-paidWidth)/100*width>=Math.max(42,unpaidLabel.length*7+14); const showInside=paidFits&&unpaidFits
 return <span className="course-row-track" ref={trackRef}>
<i className="course-row-paid" style={{width:`${paidWidth}%`}}/>
<i className="course-row-unpaid" style={{left:`${paidWidth}%`,width:`${Math.max(totalWidth-paidWidth,0)}%`}}/>
{showInside?<><span className="course-bar-value inside" style={{left:`${paidWidth/2}%`}}>{paidLabel}</span><span className="course-bar-value inside pending" style={{left:`${paidWidth+(totalWidth-paidWidth)/2}%`}}>({unpaidLabel})</span><span className="course-bar-value demand" style={{left:`${totalWidth}%`}}>- {demandLabel}</span></>:<span className="course-bar-value compact" style={{left:`${totalWidth}%`}}><b>{paidLabel}</b><small>({unpaidLabel})</small><em>- {demandLabel}</em></span>}
{children}
</span>
}
function SelectFilter({label,value,values,onChange,etecOptions=[]}:{label:string;value:string[];values:string[];onChange:(value:string[])=>void;etecOptions?:EtecPoint[]}){
 const [open,setOpen]=useState(false); const [query,setQuery]=useState(''); const filterRef=useRef<HTMLDivElement>(null); const menuId=useId(); const unavailable=values.length===0
 const displayLabel=label==='Etec'?'Local de oferta':label; const rawOptionLabel=(item:string)=>label==='Etec'?(etecOptions.find(etec=>etec.name===item)?.label.replace(/\s*\([^)]*\)\s*$/,'')??item):item; const optionLabel=(item:string)=>label==='Etec'?(etecOptions.find(etec=>etec.name===item)?formatEtecLabel(etecOptions.find(etec=>etec.name===item)!):item):label==='Curso'?compactCourseName(rawOptionLabel(item)):rawOptionLabel(item)
 const normalizedQuery=normalizeName(query); const visibleValues=values.filter(item=>normalizeName(`${rawOptionLabel(item)} ${optionLabel(item)}`).includes(normalizedQuery)); const selectionLabel=!value.length?'Todos':value.length===1?optionLabel(value[0]):`${value.length} selecionados`
 useEffect(()=>{const close=(event:PointerEvent)=>{if(!filterRef.current?.contains(event.target as Node))setOpen(false)};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape)}},[])
 const toggle=(item:string)=>onChange(value.includes(item)?value.filter(selected=>selected!==item):[...value,item])
 const toggleAll=()=>onChange(value.length===values.length?[]:[...values])
 return <div className={`filter${label==='Etec'?' filter-etec':''}${label==='Curso'?' filter-course':''}`} ref={filterRef}>
<div className="filter-title"><span>{displayLabel}</span></div>
<button className="filter-trigger" type="button" disabled={unavailable} aria-expanded={open} aria-controls={menuId} onClick={()=>setOpen(current=>!current)}><b>{unavailable?'Indisponível nesta fonte':selectionLabel}</b><i aria-hidden="true">⌄</i></button>
{open&&!unavailable&&<div className="filter-menu" id={menuId} role="dialog" aria-label={`Opções de ${displayLabel}`}>
<input className="filter-search" autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Pesquisar" aria-label={`Pesquisar ${displayLabel}`}/>
<label className="filter-option filter-select-all"><input type="checkbox" checked={value.length===values.length} onChange={toggleAll}/><span>Selecionar todos</span></label>
<div className="filter-options">{visibleValues.length?visibleValues.map(item=><label className="filter-option" key={item}><input type="checkbox" checked={value.includes(item)} onChange={()=>toggle(item)}/><span title={label==='Curso'?rawOptionLabel(item):undefined}>{optionLabel(item)}</span></label>):<p>Nenhum resultado para a busca.</p>}</div>
</div>}
</div>
}
function TrendChart({data,target}:{data:ChartData;target:number}){
 const svgRef=useRef<SVGSVGElement>(null); const [viewHeight,setViewHeight]=useState(265)
 useEffect(()=>{const svg=svgRef.current;if(!svg)return undefined;const update=()=>{if(!svg.clientWidth)return;const next=Math.max(265,Math.round(svg.clientHeight/svg.clientWidth*680));setViewHeight(current=>current===next?current:next)};const observer=new ResizeObserver(update);observer.observe(svg);update();return()=>observer.disconnect()},[])
 const plotTop=38; const plotBottom=viewHeight-52; const plotHeight=plotBottom-plotTop
 if(!data.some(item=>item.daily.length)){
  const history=data.history??[]
  const maxCount=Math.max(...history.map(point=>Math.max(point.total,point.paid)),1)
  const magnitude=10**Math.floor(Math.log10(maxCount)); const normalized=maxCount/magnitude; const yMax=(normalized<=1?1:normalized<=2?2:normalized<=5?5:10)*magnitude; const tickStep=yMax<=5?1:yMax/5; const yTicks=Array.from({length:Math.round(yMax/tickStep)+1},(_,index)=>index*tickStep); const axisLabel=(value:number)=>value>=1000?`${number.format(value/1000)} mil`:number.format(value)
  const plotLeft=74; const plotRight=644
  const points=history.map((point,index)=>{const x=history.length===1?(plotLeft+plotRight)/2:plotLeft+index*(plotRight-plotLeft)/(history.length-1);return {point,x,totalY:plotBottom-point.total/yMax*plotHeight,paidY:plotBottom-point.paid/yMax*plotHeight}})
  const latest=points.at(-1)
  const latestPaidLabelBelow=Boolean(latest&&(Math.abs(latest.totalY-latest.paidY)<42||latest.paidY-30<plotTop))
  return <div className="trend">
<div className="chart-legend chart-history-legend">
<span className="legend-total">Inscritos totais</span><span className="legend-paid">Pagos sem treineiros</span>
</div>
<svg ref={svgRef} viewBox={`0 0 680 ${viewHeight}`} role="img" aria-label="Evolução histórica de inscritos totais e pagos">
<g className="chart-grid">{yTicks.map(value=>{const y=plotBottom-value/yMax*plotHeight;return <g key={value}><line x1={plotLeft} x2={plotRight} y1={y} y2={y}/><text className="chart-axis-label" x={plotLeft-10} y={y+3} textAnchor="end">{axisLabel(value)}</text></g>})}</g>
<line className="chart-axis" x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom}/>
<text className="chart-axis-title" transform={`rotate(-90 17 ${(plotTop+plotBottom)/2})`} x="17" y={(plotTop+plotBottom)/2} textAnchor="middle">Inscritos</text>
<polyline className="chart-line chart-total-line" points={points.map(({x,totalY})=>`${x},${totalY}`).join(' ')}/>
<polyline className="chart-line chart-paid-line" points={points.map(({x,paidY})=>`${x},${paidY}`).join(' ')}/>
{points.map(({point,x,totalY,paidY})=><g key={point.referenceAt}>
<circle className="chart-dot chart-total-dot" cx={x} cy={totalY} r="5"><title>{`${new Date(point.referenceAt).toLocaleString('pt-BR')}: ${number.format(point.total)} inscritos, ${number.format(point.paid)} pagos sem treineiros (${point.regular?Math.round(point.paid/point.regular*100):0}%), ${number.format(point.vacancies)} vagas e ${(point.vacancies?point.regular/point.vacancies:0).toFixed(2)}x de demanda`}</title></circle>
<circle className="chart-paid-dot" cx={x} cy={paidY} r="3"/>
<text className="chart-date" x={x} y={plotBottom+25} textAnchor="middle">{new Date(point.referenceAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</text>
</g>)}
{latest&&<><text className="chart-latest-value" x={latest.x} y={latest.totalY-13} textAnchor="middle">{number.format(latest.point.total)}</text><text className="chart-latest-paid" x={latest.x} y={latest.paidY+(latestPaidLabelBelow?13:-16)} textAnchor="middle">{number.format(latest.point.paid)} pagos</text><text className="chart-latest-paid-rate" x={latest.x} y={latest.paidY+(latestPaidLabelBelow?25:-5)} textAnchor="middle">{latest.point.regular?Math.round(latest.point.paid/latest.point.regular*100):0}%</text></>}
</svg>
</div>
 }
 const points=Array.from({length:10},(_,index)=>({day:`Dia ${index+1}`,value:data.reduce((sum,item)=>sum+(item.daily[index]?.value??0),0)})); const max=Math.max(target,...points.map(point=>point.value),1); const pointList=points.map((point,index)=>`${72+index*65},${plotBottom-point.value/max*plotHeight}`).join(' '); const targetY=plotBottom-target/max*plotHeight
 return <div className="trend">
<div className="chart-legend">
<span className="legend-paid">Inscritos pagos</span>
<span className="legend-target">Meta prevista</span>
</div>
<svg ref={svgRef} viewBox={`0 0 680 ${viewHeight}`} role="img" aria-label="Evolução diária das inscrições">
<g className="chart-grid">{[.1,.3,.5,.7,.9].map(ratio=>
<line key={ratio} x1="70" x2="650" y1={plotTop+plotHeight*ratio} y2={plotTop+plotHeight*ratio}/>)}</g>
<line className="chart-target" x1="70" x2="650" y1={targetY} y2={targetY}/>
<path className="chart-area" d={`M72 ${plotBottom} L${pointList.replaceAll(' ',' L')} L657 ${plotBottom} Z`}/>
<polyline className="chart-line" points={pointList}/>{points.map((point,index)=>
<g key={point.day}>
<circle className="chart-dot" cx={72+index*65} cy={plotBottom-point.value/max*plotHeight} r="3.4"/>
<text x={72+index*65} y={viewHeight-16} textAnchor="middle">{index+1}</text>
</g>)}</svg>
<p className="chart-footnote">Dados acumulados por dia de inscricao</p>
</div>
}
function CourseChart({rows,summaryData,scope,asOf,period,onPeriodChange}:{rows:CourseRow[];summaryData:Enrollment[];scope:string;asOf:string;period:CoursePeriod;onPeriodChange:(period:CoursePeriod)=>void}){
 const orderedRows=[...rows].sort((a,b)=>(((b.paid+b.unpaid)/Math.max(b.vacancies,1))-((a.paid+a.unpaid)/Math.max(a.vacancies,1)))||((b.paid+b.unpaid)-(a.paid+a.unpaid))||a.course.localeCompare(b.course,'pt-BR'))
 const [activeCourse,setActiveCourse]=useState<string>('')
 const [summaryFeedback,setSummaryFeedback]=useState('')
 useEffect(()=>{setActiveCourse(current=>orderedRows.some(row=>row.course===current)?current:'')},[orderedRows])
 const enrichedRows=orderedRows.map(row=>{const total=row.paid+row.unpaid;const paidDemand=row.vacancies?row.paid/row.vacancies:0;const totalDemand=row.vacancies?total/row.vacancies:0;return {...row,total,paidDemand,totalDemand}})
 const topDemand=Math.max(...enrichedRows.map(row=>row.totalDemand),1.5)
 const scaleMax=Math.max(1.8,Math.ceil(topDemand/.25)*.25)
 const targetWidth=Math.min(1.5/scaleMax*100,100)
 const periods:[CoursePeriod,string][]=[['all','Todos'],['morning','Manhã'],['afternoon','Tarde'],['night','Noite']]
 // Build the symbols in the browser so WhatsApp receives valid Unicode characters.
 const whatsappIcons={summary:String.fromCodePoint(0x1f4ca),location:String.fromCodePoint(0x1f4cd),morning:String.fromCodePoint(0x2600,0xfe0f),afternoon:String.fromCodePoint(0x1f324,0xfe0f),night:String.fromCodePoint(0x1f319),target:String.fromCodePoint(0x1f3af)}
 const periodSections:[Exclude<CoursePeriod,'all'>,string][]=[['morning',`*${whatsappIcons.morning} MANHÃ*`],['afternoon',`*${whatsappIcons.afternoon} TARDE*`],['night',`*${whatsappIcons.night} NOITE*`]]
 const shareSummary=()=>{
  const generatedAt=formatSnapshotDate(asOf).replace(',', ' às')
  const sections=periodSections.map(([value,label])=>{
   const grouped=[...summaryData.filter(item=>matchesCoursePeriod(item.period,value)).reduce((items,item)=>{const current=items.get(item.course)??{course:item.course,paid:0,unpaid:0,vacancies:0};current.paid+=item.paid;current.unpaid+=item.unpaid;current.vacancies+=item.vacancies;items.set(item.course,current);return items},new Map<string,CourseRow>()).values()].sort((a,b)=>(b.paid+b.unpaid)-(a.paid+a.unpaid)).slice(0,10)
   if(!grouped.length)return ''
   return `${label}\n${grouped.map(item=>{const demand=item.vacancies?(item.paid+item.unpaid)/item.vacancies:0;return `${chartCourseName(item.course)} | *${number.format(item.paid)} pagos* (${number.format(item.unpaid)}) | *${demand.toFixed(1).replace('.',',')}x*`}).join('\n')}`
  }).filter(Boolean)
  return [`*${whatsappIcons.summary} RESUMO DE INSCRIÇÕES POR CURSO*`,`${whatsappIcons.location} ${scope.replace('Sao','São')} · ${generatedAt}`,`( ) = não pagos`,'',...sections,'',`${whatsappIcons.target} Meta: 1,5 candidatos por vaga`].join('\n')
 }
 const copySummary=async()=>{try{await navigator.clipboard.writeText(shareSummary());setSummaryFeedback('Resumo copiado.')}catch{setSummaryFeedback('Não foi possível copiar o resumo.')}}
 const sendToWhatsApp=()=>window.open(`https://api.whatsapp.com/send/?text=${encodeURIComponent(shareSummary())}&type=custom_url&app_absent=0`,'_blank','noopener,noreferrer')
 return <div className="course-chart">
<div className="course-plot-shell">
<div className="course-plot" role="img" aria-label="Demanda por curso, com barras de pagos, não pagos e meta de 1,5 inscritos por vaga">
<div className="course-bars-header">
<span className="course-chart-paid">Pagos</span>
<span className="course-chart-unpaid">Pendentes</span>
</div>
<div className="course-summary-actions"><button className="icon-action" type="button" onClick={copySummary} aria-label="Copiar resumo" title="Copiar resumo"><ActionIcon name="copy"/></button><button className="icon-action whatsapp-action" type="button" onClick={sendToWhatsApp} aria-label="Enviar resumo no WhatsApp" title="Enviar no WhatsApp"><ActionIcon name="whatsapp"/></button><span className="sr-only" aria-live="polite">{summaryFeedback}</span></div>
<div className="course-bars-stage">
<div className="course-bars-list">
<div className="course-bars-content">
<span className="course-target-range" aria-hidden="true"><i className="course-target-line" style={{left:`${targetWidth}%`}}/><span className="course-target-label" style={{left:`${targetWidth}%`}}>Meta 1,5x</span></span>
{enrichedRows.map((row,index)=>{const paidWidth=Math.min(row.paidDemand/scaleMax*100,100);const totalWidth=Math.min(row.totalDemand/scaleMax*100,100);const active=activeCourse===row.course;const tooltipId=`course-tooltip-${index}`;return <button type="button" className={`course-row${active?' is-active':''}`} key={row.course} aria-describedby={active?tooltipId:undefined} onMouseEnter={()=>setActiveCourse(row.course)} onMouseLeave={()=>setActiveCourse(current=>current===row.course?'':current)} onFocus={()=>setActiveCourse(row.course)} onBlur={()=>setActiveCourse(current=>current===row.course?'':current)} onClick={()=>setActiveCourse(current=>current===row.course?'':row.course)}>
<span className="course-row-label" title={row.course}>{chartCourseName(row.course)}</span>
<CourseRowTrack paid={row.paid} unpaid={row.unpaid} demand={row.totalDemand} paidWidth={paidWidth} totalWidth={totalWidth}>
{active&&<span className="course-tooltip" id={tooltipId} role="tooltip" style={{left:`${totalWidth}%`}}>
<strong>Inscritos: {number.format(row.total)}</strong>
<span>({number.format(row.paid)} pagos | {number.format(row.unpaid)} pendentes)</span>
<small>{number.format(row.vacancies)} vagas · {row.totalDemand.toFixed(1).replace('.',',')}x</small>
</span>}
</CourseRowTrack>
</button>})}
{!enrichedRows.length&&<p className="course-empty">Não há cursos para este período no recorte atual.</p>}
</div>
</div>
</div>
</div>
</div>
<div className="course-period-tabs" role="tablist" aria-label="Período dos cursos">{periods.map(([value,label])=><button type="button" key={value} role="tab" aria-selected={period===value} className={period===value?'active':''} onClick={()=>onPeriodChange(value)}>{label}</button>)}</div>
</div>
}
export default function App(){
 const [filters,setFilters]=useState<Filters>(initialFilters); const [analysisScope,setAnalysisScope]=useState<AnalysisScope>({presential:true,ead:false,trainees:false}); const [selectedEtec,setSelectedEtec]=useState(''); const [geographicScope,setGeographicScope]=useState<{label:string;etecs:string[]}|null>(null); const [mapResetKey,setMapResetKey]=useState(0); const [analysisTab,setAnalysisTab]=useState<'evolution'|'courses'|'performance'>('evolution'); const [coursePeriod,setCoursePeriod]=useState<CoursePeriod>('all'); const [statusFilter,setStatusFilter]=useState<OfferStatus|null>(null); const [colorMapByStatus,setColorMapByStatus]=useState(false); const [dashboard,setDashboard]=useState<DashboardPayload|null>(null); const [snapshotEndAt,setSnapshotEndAt]=useState(''); const [importOpen,setImportOpen]=useState(false); const [importPassword,setImportPassword]=useState(''); const [showImportPassword,setShowImportPassword]=useState(false); const [importFile,setImportFile]=useState<File|null>(null); const [importMessage,setImportMessage]=useState(''); const [importing,setImporting]=useState(false)
 const [performanceSort,setPerformanceSort]=useState<{key:PerformanceSortKey;direction:'asc'|'desc'}>({key:'regional',direction:'asc'})
 useEffect(()=>{let cancelled=false;void fetch(apiUrl('/api/dashboard-data')).then(async response=>response.ok?readJson<{snapshots?:SnapshotSeries[];etecs?:EtecPoint[]}>(response):null).then(payload=>{if(cancelled)return;setDashboard({etecs:payload?.etecs??[],snapshotSeries:payload?.snapshots??[]})}).catch(()=>{if(!cancelled)setDashboard({etecs:[],snapshotSeries:[]})});return()=>{cancelled=true}},[])
 const {etecs,snapshotSeries}=dashboard??{etecs:[],snapshotSeries:[]}; const rangeStartAt=snapshotSeries.at(0)?.referenceAt||''; const rangeEndAt=snapshotEndAt||snapshotSeries.at(-1)?.referenceAt||''; const visibleSnapshotSeries=snapshotSeries.filter(snapshot=>snapshot.referenceAt>=rangeStartAt&&snapshot.referenceAt<=rangeEndAt); const selectedSnapshot=visibleSnapshotSeries.at(-1)??snapshotSeries.at(-1); const enrollments=selectedSnapshot?.enrollments??[]
 const isEadOffer=(item:Enrollment)=>/\bEAD\b/i.test(item.course)||normalizeName(item.period).includes('ead')||normalizeName(item.period)==='on-line'; const matchesAnalysisScope=(item:Enrollment)=>item.isTrainee?analysisScope.trainees:isEadOffer(item)?analysisScope.ead:analysisScope.presential
 const etecByName=new Map(etecs.map(etec=>[etec.name,etec])); const regionalByEtec=new Map(etecs.map(etec=>{const municipality=normalizeName(etec.municipality);return [etec.name,mapRegionalByMunicipality.get(municipality)??mapRegionalFallbackByMunicipality.get(municipality)]})); const regionalFor=(item:Enrollment)=>regionalByEtec.get(item.etec)??item.regional; const cityFor=(item:Enrollment)=>etecByName.get(item.etec)?.municipality??''; const dependentKeys:FilterKey[]=['regional','city','etec','axis','course','period']; const matchesFilters=(item:Enrollment,current:Filters,ignored?:FilterKey)=>dependentKeys.every(candidate=>candidate===ignored||!current[candidate].length||(candidate==='regional'?current.regional.includes(regionalFor(item)):candidate==='city'?current.city.includes(cityFor(item)):candidate==='axis'?current.axis.includes(item.axis??''):current[candidate].includes(item[candidate]))); const valuesFor=(key:FilterKey,current:Filters,scope=geographicScope)=>{const items=enrollments.filter(item=>(!scope||scope.etecs.includes(item.etec))&&matchesFilters(item,current,key)); const validItems=(key==='axis'||key==='course'||key==='period')?items.filter(item=>!item.isTrainee):items; return [...new Set(validItems.map(item=>key==='regional'?regionalFor(item):key==='city'?cityFor(item):key==='axis'?item.axis??'':item[key]).filter(Boolean))].sort()}; const mapRegionalOptions=REGIONAIS.features.map(feature=>String(feature.properties.regional??'')).filter(regional=>enrollments.some(item=>regionalFor(item)===regional)); const normalizeFilters=(next:Filters,preserve?:FilterKey,scope=geographicScope)=>{let normalized=next; let changed=true; while(changed){changed=false; dependentKeys.forEach(key=>{const values=key==='regional'?mapRegionalOptions:valuesFor(key,normalized,scope);const nextValues=key===preserve?normalized[key]:normalized[key].filter(value=>values.includes(value));if(nextValues.length!==normalized[key].length){normalized={...normalized,[key]:nextValues};changed=true}})} return normalized}; const options={regional:mapRegionalOptions,city:valuesFor('city',filters),etec:valuesFor('etec',filters),axis:valuesFor('axis',filters),course:valuesFor('course',filters),period:valuesFor('period',filters)}
 const updateFilter=(key:FilterKey,value:string[])=>{setGeographicScope(null);setFilters(current=>normalizeFilters({...current,[key]:value},key,null));if(key!=='regional'&&key!=='city')setMapResetKey(current=>current+1);setSelectedEtec(key==='etec'&&value.length===1?value[0]:'')}; const selectEtec=(etec:string)=>{const scope={label:etec,etecs:[etec]};const city=etecByName.get(etec)?.municipality??'';setSelectedEtec(etec);setGeographicScope(scope);setFilters(current=>normalizeFilters({...current,city:city?[city]:[],etec:[etec]},'etec',scope))}; const selectGeographicScope=(label:string,scopedEtecs:string[])=>{const scope={label,etecs:scopedEtecs};const scopedCities=[...new Set(scopedEtecs.map(etec=>etecByName.get(etec)?.municipality).filter((city):city is string=>Boolean(city)))];const city=scopedCities.length===1?scopedCities[0]:'';setSelectedEtec('');setGeographicScope(scope);setFilters(current=>normalizeFilters({...current,city:city?[city]:[],etec:[]},city?'city':undefined,scope))}; const selectRegionalCities=(regional:string)=>{setSelectedEtec('');setGeographicScope(null);setFilters(current=>{const base={...current,regional:[],city:[],etec:[]};const availableCities=new Set(valuesFor('city',base,null));const cities=(MUN_BY_REGIONAL[regional]?.features??[]).map(feature=>String(feature.properties.name??'')).filter(city=>availableCities.has(city));return normalizeFilters({...base,city:cities},'city',null)})}; const clearGeographicScope=()=>{setSelectedEtec('');setGeographicScope(null);setFilters(current=>normalizeFilters({...current,city:[],etec:[]},undefined,null))}; const clearFilters=()=>{setSelectedEtec('');setGeographicScope(null);setStatusFilter(null);setFilters(initialFilters);setMapResetKey(current=>current+1)}
 const uploadImport=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!importFile||!importPassword){setImportMessage('Informe a senha e selecione a planilha para continuar.');return}setImporting(true);setImportMessage('Validando e importando a planilha...');try{const response=await fetch(apiUrl('/api/import-inscricoes'),{method:'POST',headers:{'X-Import-Password':importPassword,'Content-Type':importFile.type||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','X-File-Name':encodeURIComponent(importFile.name)},body:importFile});const payload=await readJson<{error?:string;records?:number}>(response);if(!response.ok)throw new Error(payload.error??'Não foi possível importar a planilha.');setImportPassword('');setImportMessage(`Importação publicada com ${number.format(payload.records??0)} ofertas. Atualizando o painel...`);window.setTimeout(()=>window.location.reload(),900)}catch(error){setImportMessage(error instanceof Error?error.message:'Não foi possível importar a planilha.')}finally{setImporting(false)}}
 const matchesBaseScope=(item:Enrollment)=>matchesFilters(item,filters)&&(!geographicScope||geographicScope.etecs.includes(item.etec))
 const matchesStatus=(item:Enrollment)=>!statusFilter||(item.vacancies>0&&offerStatusFor(item)===statusFilter)
 const matchesActiveScope=(item:Enrollment)=>matchesAnalysisScope(item)&&matchesBaseScope(item)&&(!statusFilter||(!item.isTrainee&&matchesStatus(item)))
 const matchesPresentialOfferScope=(item:Enrollment)=>!item.isTrainee&&!isEadOffer(item)&&matchesBaseScope(item)&&matchesStatus(item)
 const scopedHistory=visibleSnapshotSeries.map(({referenceAt,enrollments:items})=>{const scoped=items.filter(matchesActiveScope);const regular=scoped.filter(item=>!item.isTrainee);const paid=regular.reduce((sum,item)=>sum+item.paid,0);const unpaid=regular.reduce((sum,item)=>sum+item.unpaid,0);const trainee=scoped.filter(item=>item.isTrainee).reduce((sum,item)=>sum+item.paid+item.unpaid,0);const vacancies=regular.reduce((sum,item)=>sum+item.vacancies,0);return {referenceAt,total:paid+unpaid+trainee,paid,unpaid,trainee,regular:paid+unpaid,vacancies}})
 const data=Object.assign(enrollments.filter(matchesActiveScope),{history:scopedHistory}) as ChartData
 const courseRows=[...data.filter(item=>!item.isTrainee&&matchesCoursePeriod(item.period,coursePeriod)).reduce((rows,item)=>{const current=rows.get(item.course)??{course:item.course,paid:0,unpaid:0,vacancies:0};current.paid+=item.paid;current.unpaid+=item.unpaid;current.vacancies+=item.vacancies;rows.set(item.course,current);return rows},new Map<string,CourseRow>()).values()].sort((a,b)=>b.paid-a.paid||a.course.localeCompare(b.course,'pt-BR'))
 const totals=data.reduce((r,item)=>({paid:r.paid+(item.isTrainee?0:item.paid),unpaid:r.unpaid+(item.isTrainee?0:item.unpaid),vacancies:r.vacancies+(item.isTrainee?0:item.vacancies),target:r.target+item.target,trainee:r.trainee+(item.isTrainee?item.paid+item.unpaid:0),regular:r.regular+(item.isTrainee?0:item.paid+item.unpaid)}),{paid:0,unpaid:0,vacancies:0,target:0,trainee:0,regular:0})
 const total=totals.paid+totals.unpaid+totals.trainee
 const presentialOfferData=enrollments.filter(matchesPresentialOfferScope)
 const demandTotals=presentialOfferData.reduce((r,item)=>({vacancies:r.vacancies+item.vacancies,paid:r.paid+item.paid}),{vacancies:0,paid:0})
 const demandBands=presentialOfferData.filter(item=>item.vacancies>0).reduce((r,item)=>{const demand=item.paid/item.vacancies;if(demand>=1.5)r.comfortable++;else if(demand>=1)r.attention++;else r.low++;return r},{comfortable:0,attention:0,low:0})
 const regularOfferCount=demandBands.comfortable+demandBands.attention+demandBands.low
 const activeEtecNames=new Set(data.map(item=>item.etec)); const activeEtecs=etecs.filter(etec=>activeEtecNames.has(etec.name)); const selectedEtecLabel=etecs.find(etec=>etec.name===selectedEtec); const selectedEtecDisplayLabel=selectedEtecLabel?formatEtecLabel(selectedEtecLabel):selectedEtec
 const scope=selectedEtec?selectedEtecDisplayLabel:(geographicScope?.label??'Estado de Sao Paulo')
 const geographicScopeIsMunicipality=Boolean(geographicScope?.etecs.every(name=>etecs.find(etec=>etec.name===name)?.municipality===geographicScope.label)); const selectedCityRegionals=[...new Set(filters.city.map(city=>mapRegionalByMunicipality.get(normalizeName(city))??mapRegionalFallbackByMunicipality.get(normalizeName(city))).filter((regional):regional is string=>Boolean(regional)))]; const selectedEtecMunicipalities=[...new Set(filters.etec.map(etec=>etecByName.get(etec)?.municipality).filter((city):city is string=>Boolean(city)))]; const selectedEtecRegionals=[...new Set(selectedEtecMunicipalities.map(city=>mapRegionalByMunicipality.get(normalizeName(city))??mapRegionalFallbackByMunicipality.get(normalizeName(city))).filter((regional):regional is string=>Boolean(regional)))]; const selectedMapMunicipalities=filters.city.length?filters.city:selectedEtecMunicipalities; const highlightedMapRegionals=filters.regional.length?filters.regional:selectedCityRegionals.length?selectedCityRegionals:selectedEtecRegionals; const focusedMapRegional=filters.regional.length===1?filters.regional[0]:selectedCityRegionals.length===1?selectedCityRegionals[0]:selectedEtecRegionals.length===1?selectedEtecRegionals[0]:geographicScope?(geographicScopeIsMunicipality?(mapRegionalByMunicipality.get(normalizeName(geographicScope.label))??''):geographicScope.label):''; const focusedMapMunicipality=geographicScopeIsMunicipality?(geographicScope?.label??''):''
 const scopedUnits=selectedEtec?[selectedEtec]:filters.etec; const scopedSedes=new Set(scopedUnits.map(unit=>unit.split('.')[0])); const isSingleSede=scopedUnits.length>0&&scopedSedes.size===1; const hasMunicipalityScope=geographicScopeIsMunicipality||filters.city.length===1; const hasBroadGeographicScope=filters.regional.length>0||filters.city.length>1||Boolean(geographicScope&&!geographicScopeIsMunicipality)||(scopedUnits.length>0&&!isSingleSede); const performanceDimension=isSingleSede||hasMunicipalityScope?'course':hasBroadGeographicScope?'municipality':'regional'; const performanceColumn=performanceDimension==='course'?'Curso':performanceDimension==='municipality'?'Município':'Regional'; const performanceTabLabel=`Desempenho por ${performanceDimension==='course'?'Curso':performanceDimension==='municipality'?'Município':'Regional'}`
 const activeModes=[analysisScope.presential&&'Presencial',analysisScope.ead&&'EAD',analysisScope.trainees&&'Treineiros'].filter((mode):mode is string=>Boolean(mode))
 const enrollmentScope=activeModes.join(' + ')||'Nenhum tipo selecionado'
 const demandRatio=demandTotals.vacancies?demandTotals.paid/demandTotals.vacancies:null
 const kpis=[['Inscritos totais',number.format(total),`${number.format(totals.trainee)} Treineiros incluidos`,'blue'],['Inscritos pagos',number.format(totals.paid),`${total?Math.round(totals.paid/total*100):0}% do total`,'green'],['Inscritos isentos',exemptionMetrics?number.format(exemptionMetrics.inscritos_com_isencao):'N/D','fonte de isenção indisponível','purple'],['Conversao',`${total?Math.round(totals.paid/total*100):0}%`,'Pagos / totais','amber'],['Vagas oferecidas',number.format(totals.vacancies),'somente ofertas regulares','cyan'],['Demanda efetiva',demandRatio===null?'N/A':`${demandRatio.toFixed(1)}x`,'somente inscritos regulares','orange']]
 const describeSelected=(label:string,values:string[],format=(value:string)=>value)=>values.length?`${label}: ${values.length===1?format(values[0]):`${values.length} selecionados`}`:''; const geographicSummary=selectedEtec?`Local de oferta: ${selectedEtecDisplayLabel}`:geographicScope?`${geographicScopeIsMunicipality?'Município':'Regional'}: ${geographicScope.label}`:''; const scopeSummary=[geographicSummary,describeSelected('Regional',filters.regional),describeSelected('Cidade',filters.city),!selectedEtec?describeSelected('Local de oferta',filters.etec,value=>{const etec=etecByName.get(value);return etec?formatEtecLabel(etec):value}):'',describeSelected('Eixo tecnológico',filters.axis),describeSelected('Curso',filters.course,compactCourseName),describeSelected('Período',filters.period)].filter(Boolean).join(' • ')||scope.replace('Sao','São')
 void kpis
 const visible=activeEtecs.map(etec=>etec.name); const performanceGroups=new Map<string,Enrollment[]>(); data.forEach(item=>{const group=performanceDimension==='course'?item.course:performanceDimension==='municipality'?cityFor(item):regionalFor(item);const items=performanceGroups.get(group)??[];items.push(item);performanceGroups.set(group,items)}); const performanceRows=[...performanceGroups.entries()].map(([group,items])=>{const regularItems=items.filter(item=>!item.isTrainee);const value=items.reduce((sum,item)=>sum+item.paid+item.unpaid,0);const regularValue=regularItems.reduce((sum,item)=>sum+item.paid+item.unpaid,0);const paid=regularItems.reduce((sum,item)=>sum+item.paid,0);const vacancies=regularItems.reduce((sum,item)=>sum+item.vacancies,0);const offersWithVacancies=regularItems.filter(item=>item.vacancies>0);const lowDemand=offersWithVacancies.filter(item=>(item.paid+item.unpaid)/item.vacancies<1).length;return {group,value,regularValue,paid,vacancies,lowDemand,regularOfferCount:offersWithVacancies.length}}).filter(row=>row.value>0).sort((a,b)=>a.group.localeCompare(b.group,'pt-BR')); const drillIntoPerformanceRow=(group:string)=>{if(performanceDimension==='course')return;const scopedEtecs=etecs.filter(etec=>performanceDimension==='regional'?regionalByEtec.get(etec.name)===group:etec.municipality===group).map(etec=>etec.name);if(scopedEtecs.length)selectGeographicScope(group,scopedEtecs)}; const goBackPerformanceLevel=()=>{if(performanceDimension==='course'&&geographicScopeIsMunicipality&&focusedMapRegional){const regionalEtecs=etecs.filter(etec=>regionalByEtec.get(etec.name)===focusedMapRegional).map(etec=>etec.name);selectGeographicScope(focusedMapRegional,regionalEtecs);return}clearGeographicScope()}; const performanceBackLabel=performanceDimension==='course'&&geographicScopeIsMunicipality?'Voltar para municípios':'Voltar para regionais'; const mapFilters=geographicScope?{...filters,city:[],etec:[]}:filters; const mapOffers=enrollments.filter(item=>!item.isTrainee&&!isEadOffer(item)&&matchesFilters(item,mapFilters)&&item.vacancies>0); const lowDemandRate=(items:Enrollment[])=>items.length?items.filter(item=>item.paid/item.vacancies<1).length/items.length:undefined; const mapRegionalLowDemandRates:Record<string,number>=Object.fromEntries(options.regional.flatMap(regional=>{const rate=lowDemandRate(mapOffers.filter(item=>regionalFor(item)===regional));return rate===undefined?[]:[[regional,rate]]})); const mapMunicipalityLowDemandRates:Record<string,number>=Object.fromEntries([...new Set(etecs.map(etec=>etec.municipality))].flatMap(municipality=>{const rate=lowDemandRate(mapOffers.filter(item=>normalizeName(cityFor(item))===normalizeName(municipality)));return rate===undefined?[]:[[normalizeName(municipality),rate]]})); const mapRegionalStatuses:Record<string,RegionalStatus>=Object.fromEntries(options.regional.map(regional=>{const offers=mapOffers.filter(item=>regionalFor(item)===regional);const paid=offers.reduce((sum,item)=>sum+item.paid,0);const vacancies=offers.reduce((sum,item)=>sum+item.vacancies,0);const ratio=vacancies?paid/vacancies:0;return [regional,vacancies?(ratio>=1.5?'comfortable':ratio>=1?'attention':'low'):'unavailable']})); const locationStatusCounts=(items:Enrollment[])=>{const totalsByLocation=new Map<string,{paid:number;vacancies:number}>();items.forEach(item=>{const current=totalsByLocation.get(item.etec)??{paid:0,vacancies:0};current.paid+=item.paid;current.vacancies+=item.vacancies;totalsByLocation.set(item.etec,current)});return [...totalsByLocation.values()].reduce((counts,{paid,vacancies})=>{const ratio=vacancies?paid/vacancies:0;counts.total++;if(ratio>=1.5)counts.comfortable++;else if(ratio>=1)counts.attention++;else counts.low++;return counts},{total:0,comfortable:0,attention:0,low:0})}; const turmaStatusCounts=(items:Enrollment[])=>items.reduce((counts,item)=>{const ratio=item.vacancies?item.paid/item.vacancies:0;counts.total++;if(ratio>=1.5)counts.comfortable++;else if(ratio>=1)counts.attention++;else counts.low++;return counts},{total:0,comfortable:0,attention:0,low:0}); const regionalLocationStatusCounts=Object.fromEntries(options.regional.map(regional=>[regional,locationStatusCounts(mapOffers.filter(item=>regionalFor(item)===regional))])); const municipalityLocationStatusCounts=Object.fromEntries([...new Set(etecs.map(etec=>etec.municipality))].map(municipality=>{const items=mapOffers.filter(item=>normalizeName(cityFor(item))===normalizeName(municipality));const locations=locationStatusCounts(items);return [normalizeName(municipality),locations.total===1?{...turmaStatusCounts(items),label:'Turmas' as const}:{...locations,label:'Locais de oferta' as const}]})); const mapStatusKey=[...Object.entries(mapRegionalLowDemandRates),...Object.entries(mapMunicipalityLowDemandRates),...Object.entries(regionalLocationStatusCounts),...Object.entries(municipalityLocationStatusCounts)].map(([label,value])=>`${label}:${typeof value==='number'?value:JSON.stringify(value)}`).join('|'); const offerStatus=[['Demanda confortável',demandBands.comfortable,'demand-comfortable'],['Atenção',demandBands.attention,'demand-attention'],['Baixa demanda',demandBands.low,'demand-low']] as const
 const performanceHeaders:[PerformanceSortKey,string][]=[['regional',performanceColumn],['total','Inscritos'],['paid','Pagos'],['conversion','Conversão'],['demand','Demanda'],['situation','Situação']]
 const sortedPerformanceRows=[...performanceRows].sort((left,right)=>{const valueFor=(row:typeof performanceRows[number])=>performanceSort.key==='regional'?row.group:performanceSort.key==='total'?row.value:performanceSort.key==='paid'?row.paid:performanceSort.key==='conversion'?(row.value?row.paid/row.value:0):performanceSort.key==='demand'?(row.vacancies?row.regularValue/row.vacancies:0):({comfortable:3,attention:2,low:1,unavailable:0}[situationFor(row.regularValue,row.vacancies)]);const first=valueFor(left);const second=valueFor(right);const comparison=typeof first==='string'?first.localeCompare(second as string,'pt-BR'):(first as number)-(second as number);return performanceSort.direction==='asc'?comparison:-comparison})
 const togglePerformanceSort=(key:PerformanceSortKey)=>setPerformanceSort(current=>current.key===key?{key,direction:current.direction==='asc'?'desc':'asc'}:{key,direction:key==='regional'||key==='situation'?'asc':'desc'})
 return <div className="app-shell">
<header className="institutional-header">
<div className="brand">
<div className="brand-primary">
<h1>VESTIBULINHO 2027.1</h1>
<p>Acompanhamento das Inscrições</p>
</div>
<span className="brand-deadline-divider" aria-hidden="true"/>
<div className="brand-deadlines"><span>INSCRIÇÕES ATÉ 3/11</span><span>PROVA 6/12</span></div>
</div>
<div className="header-meta">
<div className="analysis-scope" role="group" aria-label="Recorte">
<span className="analysis-scope-title">Recorte</span>
<div className="analysis-scope-options">{([['presential','Presencial'],['ead','EAD'],['trainees','Treineiros']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={analysisScope[key]} onChange={event=>setAnalysisScope(current=>({...current,[key]:event.target.checked}))}/><span>{label}</span></label>)}</div>
</div>
{snapshotSeries.length?<label className="snapshot-filter">
<span>Dados até</span>
<select value={rangeEndAt} onChange={event=>setSnapshotEndAt(event.target.value)} aria-label="Dados até">
{snapshotSeries.map(snapshot=><option key={snapshot.referenceAt} value={snapshot.referenceAt}>{formatSnapshotDate(snapshot.referenceAt)}</option>)}
</select>
</label>:<p className="empty-data-notice">Nenhuma planilha publicada nesta edição.</p>}
<button className="import-trigger icon-action" type="button" onClick={()=>{setImportMessage('');setImportOpen(true)}} aria-label="Importar planilha" title="Importar planilha"><ActionIcon name="import"/></button>
</div>
</header>
<main className="content">
<section className="filter-card">
<div className="filter-bar">
<SelectFilter label="Regional" value={filters.regional} values={options.regional} onChange={value=>updateFilter('regional',value)}/>
<SelectFilter label="Cidade" value={filters.city} values={options.city} onChange={value=>updateFilter('city',value)}/>
<SelectFilter label="Etec" value={filters.etec} values={options.etec} onChange={value=>updateFilter('etec',value)} etecOptions={etecs}/>
<SelectFilter label="Eixo tecnológico" value={filters.axis} values={options.axis} onChange={value=>updateFilter('axis',value)}/>
<SelectFilter label="Curso" value={filters.course} values={options.course} onChange={value=>updateFilter('course',value)}/>
<SelectFilter label="Periodo" value={filters.period} values={options.period} onChange={value=>updateFilter('period',value)}/>
<button className="clear-button" type="button" onClick={clearFilters}>Limpar filtros</button>
</div>
</section>
<section className="scope-row">
<div>
<span>VISUALIZANDO</span>
<strong>{scopeSummary}</strong>
</div>{(selectedEtec||geographicScope)&&<button className="selection-clear" type="button" onClick={clearFilters}>Limpar selecao</button>}</section>
<section className="dashboard-top">
<section className="kpi-row consolidated-kpis">
<article className="kpi-card enrollment-kpi">
<div className="enrollment-copy">
<div className="enrollment-heading"><p>Inscrições</p><span title={enrollmentScope}>{enrollmentScope}</span></div>
<div className="enrollment-content">
<strong>{number.format(total)}</strong>
<div className="enrollment-progress" role="progressbar" aria-label={`Inscrições: ${number.format(totals.paid)} pagos regulares, ${number.format(totals.unpaid)} não pagos regulares e ${number.format(totals.trainee)} treineiros`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={total?Math.round(totals.paid/total*100):0}>
<i className="enrollment-progress-paid" style={{width:`${total?totals.paid/total*100:0}%`}}/>
<i className="enrollment-progress-unpaid" style={{width:`${total?totals.unpaid/total*100:0}%`}}/>
<i className="enrollment-progress-trainee" style={{width:`${total?totals.trainee/total*100:0}%`}}/>
</div>
<div className={`enrollment-metrics${analysisScope.trainees?' has-trainees':''}`}>
<span className="enrollment-metric paid">{number.format(totals.paid)} pagos{activeModes.length>0&&` (${total?Math.round(totals.paid/total*100):0}%)`}</span>
<span className="enrollment-metric unpaid">{number.format(totals.unpaid)} não pagos{activeModes.length>0&&` (${total?Math.round(totals.unpaid/total*100):0}%)`}</span>
{analysisScope.trainees&&<span className="enrollment-metric trainee">{number.format(totals.trainee)} treineiros{activeModes.length>0&&` (${total?Math.round(totals.trainee/total*100):0}%)`}</span>}
</div>
</div>
</div>
</article>
<article className="kpi-card demand-kpi">
<div className="demand-heading"><p>Vagas e demanda</p><span>Somente presencial</span></div>
<div className="demand-copy"><div className="demand-content"><div className="demand-values"><strong>{number.format(demandTotals.vacancies)}</strong><small>vagas presenciais</small></div><small>{number.format(demandTotals.paid)} inscritos pagos presenciais</small></div></div>
<div className="demand-badge" aria-label={demandRatio===null?'Demanda não aplicável: não há vagas no recorte':`${demandRatio.toFixed(1)} candidatos por vaga`}>
<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
<div><strong>{demandRatio===null?'N/A':`${demandRatio.toFixed(1)}x`}</strong><span>{demandRatio===null?'sem vagas no recorte':'candidato/vaga'}</span></div>
</div>
</article>
<article className="kpi-card offer-status-kpi">
<div className="kpi-status-heading">
<p>Situação das ofertas</p>
<small>{number.format(regularOfferCount)} turmas presenciais, por pagos</small>
</div>
<div className="status-list">{offerStatus.map(([label,value,tone],index)=>{const percentage=regularOfferCount?value/regularOfferCount*100:0;const roundedPercentage=Math.round(percentage);const progressLabelFits=percentage>=7;return <button type="button" key={label} className={`${tone}${statusFilter===(['comfortable','attention','low'] as OfferStatus[])[index]?' active':''}`} onClick={()=>{const next=(['comfortable','attention','low'] as OfferStatus[])[index];setStatusFilter(current=>current===next?null:next)}}>
<div className="status-value"><strong data-label={label}>{number.format(value)}</strong></div>
<div className="status-progress" role="progressbar" aria-label={`${label}: ${roundedPercentage}% das ofertas`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={roundedPercentage}>{percentage>0&&<i style={{width:`${percentage}%`,opacity:.12+percentage/100*.88}}/>}<span className={`status-progress-label${progressLabelFits?'':' status-progress-label-outside'}${percentage<55?' status-progress-label-tone':''}`} style={{left:`${progressLabelFits?percentage/2:0}%`}}>{roundedPercentage}%</span></div>
</button>})}</div>
</article>
</section>
<div className="primary-panels">
<article className="panel map-panel">
<div className="panel-header map-panel-header">
<h2>Distribuição geográfica das inscrições pagas</h2>
<label className="map-status-toggle"><input type="checkbox" checked={colorMapByStatus} onChange={event=>setColorMapByStatus(event.target.checked)}/><span>Situação</span></label>
<span>{visible.length} locais</span>
</div>
<D3GeographicMap etecs={etecs} selected={selectedEtec} visible={visible} selectedRegionals={highlightedMapRegionals} selectedMunicipalities={selectedMapMunicipalities} focusedRegional={focusedMapRegional} focusedMunicipality={focusedMapMunicipality} resetKey={mapResetKey} regionalStatuses={mapRegionalStatuses} regionalLowDemandRates={mapRegionalLowDemandRates} municipalityLowDemandRates={mapMunicipalityLowDemandRates} regionalLocationStatusCounts={regionalLocationStatusCounts} municipalityLocationStatusCounts={municipalityLocationStatusCounts} colorByStatus={colorMapByStatus} mapStatusKey={mapStatusKey} onSelect={selectEtec} onGeographicSelect={selectGeographicScope} onRegionalCitiesSelect={selectRegionalCities} onGeographicClear={clearGeographicScope}/>
<p className="panel-note">Navegue pelas regionais e municípios, ou clique em um local para filtrar o painel.</p>
</article>
<article className="panel evolution-panel">
<div className="panel-header">
<h2>Acompanhamento das inscrições</h2>
</div>
<div className="analysis-tabs" role="tablist" aria-label="Análises">
<button type="button" role="tab" aria-selected={analysisTab==='evolution'} className={analysisTab==='evolution'?'active':''} onClick={()=>setAnalysisTab('evolution')}>Evolução</button>
<button type="button" role="tab" aria-selected={analysisTab==='courses'} className={analysisTab==='courses'?'active':''} onClick={()=>setAnalysisTab('courses')}>Cursos</button>
<button type="button" role="tab" aria-selected={analysisTab==='performance'} className={analysisTab==='performance'?'active':''} onClick={()=>setAnalysisTab('performance')}>{performanceTabLabel}</button>
</div>
{analysisTab==='evolution'?<TrendChart data={data} target={totals.target}/>:analysisTab==='courses'?<CourseChart rows={courseRows} summaryData={data.filter(item=>!item.isTrainee)} scope={scope} asOf={rangeEndAt} period={coursePeriod} onPeriodChange={setCoursePeriod}/>:<div className="regional-table analysis-regional-table">
<div className="regional-head">
{performanceHeaders.map(([key,label])=>{const active=performanceSort.key===key;return <button type="button" className={`regional-sort${active?' active':''}`} key={key} onClick={()=>togglePerformanceSort(key)} aria-label={`Ordenar por ${label}${active?`, ordem ${performanceSort.direction==='asc'?'crescente':'decrescente'}`:''}`}><span>{label}</span>{active&&<i className="regional-sort-arrow" aria-hidden="true">{performanceSort.direction==='asc'?'▲':'▼'}</i>}</button>})}
</div>{sortedPerformanceRows.map(row=>
<button type="button" className={`regional-line${performanceDimension==='course'?'':' is-drilldown'}`} key={row.group} onClick={()=>drillIntoPerformanceRow(row.group)} disabled={performanceDimension==='course'} aria-label={performanceDimension==='course'?row.group:`Abrir ${row.group}`}>
<strong>{row.group}</strong>
<span>{number.format(row.value)}</span>
<span>{number.format(row.paid)}</span>
<span>{row.value?`${Math.round(row.paid/row.value*100)}%`:'0%'}</span>
<span>{row.vacancies?`${(row.regularValue/row.vacancies).toFixed(1)}x`:'N/A'}</span>
<span className={`performance-situation status-${situationFor(row.regularValue,row.vacancies)}`}>{situationLabel(situationFor(row.regularValue,row.vacancies))}</span>
</button>)}<div className="regional-total">
<strong>Total geral</strong>
<span>{number.format(total)}</span>
<span>{number.format(totals.paid)}</span>
<span>{total?`${Math.round(totals.paid/total*100)}%`:'0%'}</span>
<span>{totals.vacancies?`${(totals.regular/totals.vacancies).toFixed(1)}x`:'N/A'}</span>
<span className={`performance-situation status-${situationFor(totals.regular,totals.vacancies)}`}>{situationLabel(situationFor(totals.regular,totals.vacancies))}</span>
</div>
</div>
}
</article>
</div>
</section>
</main>
{importOpen&&<div className="import-backdrop" role="presentation"><section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title"><button className="import-close" type="button" aria-label="Fechar" onClick={()=>setImportOpen(false)}>×</button><p className="import-eyebrow">Atualização de dados</p><h2 id="import-title">Importar planilha</h2><p className="import-copy">Informe a senha de importação e selecione a exportação do Vestibulinho. A versão anterior continuará disponível até esta planilha ser validada e publicada.</p><form onSubmit={uploadImport}><label className="import-email">Senha de importação<span className="import-password-field"><input type={showImportPassword?'text':'password'} value={importPassword} onChange={event=>setImportPassword(event.target.value)} autoComplete="current-password" required/><button type="button" className="import-password-toggle" aria-label={showImportPassword?'Ocultar senha':'Mostrar senha'} aria-pressed={showImportPassword} onClick={()=>setShowImportPassword(current=>!current)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>{showImportPassword&&<path d="m4 4 16 16"/>}</svg></button></span></label><label className="import-file">Arquivo .xls ou .xlsx<input type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event=>setImportFile(event.target.files?.[0]??null)}/><span>{importFile?.name??'Selecionar exportação do Vestibulinho'}</span></label><button className="import-submit" type="submit" disabled={importing}>{importing?'Importando...':'Validar e publicar'}</button></form><p className="import-message" role="status">{importMessage}</p></section></div>}
<footer className="dashboard-footer">Correções e atualizações: rafael.ruiz@cps.sp.gov.br · CGTEC — ASCA
</footer>
</div>
}
