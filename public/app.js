const $ = (id) => document.getElementById(id);
const sample = `# EasyPeasy에 오신 것을 환영합니다!
name = input(ask("이름을 입력하세요: "))
age = input(ask("나이를 입력하세요: "))

print("안녕하세요", name)
print("내년 나이:", age + 1)

numbers = [5, 2, 9, 1, 7]
print("오름차순:", upsort(numbers))
print("대문자만:", only_upper("Hello EASYPeasy WORLD!"))
`;
let editor = null;
let currentCode = sample;
let savedCode = sample;
let pendingEdit = null;
let proposedCode = null;
let pendingExplanation = "";
let activePanel = "output";
let toastTimer;
let fallback = false;
const projectFiles = new Map([['main.ep', sample]]);
const projectFolders = new Set();
let activePath = 'main.ep';
let contextTarget = null;
function saveActiveFile() { if (activePath && projectFiles.has(activePath)) projectFiles.set(activePath, getCode()); }
function activeName() { return activePath.split('/').pop(); }
function cleanPath(value) { return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').split('/').filter(x => x && x !== '.' && x !== '..').join('/'); }
function renderFileTree() {
  const tree = $('fileTree'); if (!tree) return;
  const entries = [...[...projectFolders].map(path => ({path,folder:true})), ...[...projectFiles.keys()].map(path => ({path,folder:false}))].sort((a,b)=>a.path.localeCompare(b.path));
  tree.innerHTML = entries.map(item => `<button class="file-row ${item.folder?'folder-row':''} ${!item.folder&&item.path===activePath?'active':''}" data-path="${escapeHTML(item.path)}" data-kind="${item.folder?'folder':'file'}" style="padding-left:${17+Math.max(0,item.path.split('/').length-1)*13}px"><span class="file-icon">${item.folder?'▸':'ϟ'}</span><span class="file-name">${escapeHTML(item.path.split('/').pop())}</span><span class="file-kind">${item.folder?'폴더':''}</span></button>`).join('') || '<div class="side-note">파일이 없습니다.</div>';
  tree.querySelectorAll('[data-path]').forEach(row=>{
    row.addEventListener('click',()=>row.dataset.kind==='folder'?showToast('폴더입니다. 내부 파일은 아래 목록에서 선택하세요.'):openProjectFile(row.dataset.path));
    row.addEventListener('contextmenu',e=>{e.preventDefault();showContextMenu(e.clientX,e.clientY,row.dataset.path,row.dataset.kind);});
  });
}
function openProjectFile(path) {
  saveActiveFile(); if(!projectFiles.has(path))return;
  activePath=path; savedCode=projectFiles.get(path); currentCode=savedCode;
  if(editor)editor.setValue(currentCode);else $('fallbackEditor').value=currentCode;
  $('activeFileName').textContent=activeName(); $('mainFileTab').querySelector('.file-icon').textContent=activeName().endsWith('.py')?'Py':'ϟ';
  document.querySelector('.crumb').innerHTML=`${escapeHTML(path)} <span>/</span> EasyPeasy`;
  markDirty();renderFileTree();runDiagnostics();$('sidebar').classList.remove('mobile-open');
}
function addProjectFile() {
  const kind=(prompt('추가할 항목을 선택하세요: 파일은 f, 폴더는 d','f')||'').trim().toLowerCase();if(!kind)return;
  const folder=['d','folder','폴더'].includes(kind);if(!folder&&!['f','file','파일'].includes(kind))return showToast('파일은 f, 폴더는 d를 입력하세요.');
  let path=cleanPath(prompt(folder?'폴더 이름':'파일 이름',folder?'src':'new-file.ep'));if(!path)return;if(!folder&&!path.includes('.'))path+='.ep';
  if(projectFiles.has(path)||projectFolders.has(path))return showToast('같은 이름의 항목이 이미 있습니다.');
  if(folder){projectFolders.add(path);renderFileTree();}else{projectFiles.set(path,'');openProjectFile(path);}showToast(folder?'폴더를 추가했습니다.':'파일을 추가했습니다.');
}
function downloadText(filename,content,type='text/plain;charset=utf-8') {const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadOne(path){saveActiveFile();if(projectFiles.has(path))downloadText(path.split('/').pop(),projectFiles.get(path));}
async function exportProject(){
  saveActiveFile();const files=[...projectFiles.entries()];
  if(files.length===1&&projectFolders.size===0){downloadOne(files[0][0]);savedCode=getCode();markDirty();return;}
  if(!window.JSZip)return showToast('ZIP 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.');
  const zip=new JSZip();files.forEach(([path,code])=>zip.file(path,code));projectFolders.forEach(path=>zip.folder(path));
  const blob=await zip.generateAsync({type:'blob'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='easypeasy-project.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);savedCode=getCode();markDirty();showToast(`${files.length}개 파일을 ZIP으로 내보냈습니다.`);
}
function showContextMenu(x,y,path,kind){
  contextTarget={path,kind};const menu=$('contextMenu');const actions=kind==='folder'?[['rename','이름 바꾸기'],['delete','폴더 삭제','danger']]:[['rename','이름 바꾸기'],['delete','삭제','danger'],['download','이 파일만 다운로드']];
  menu.innerHTML=actions.map(([action,label,cls=''])=>`<button role="menuitem" data-action="${action}" class="${cls}">${label}</button>`).join('');menu.classList.remove('hidden');menu.style.left=Math.min(x,innerWidth-180)+'px';menu.style.top=Math.min(y,innerHeight-150)+'px';menu.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>{menu.classList.add('hidden');performFileAction(btn.dataset.action);}));
}
function performFileAction(action){
  if(!contextTarget)return;const {path,kind}=contextTarget;contextTarget=null;if(action==='download')return downloadOne(path);
  if(action==='rename'){
    const next=cleanPath(prompt('새 이름을 입력하세요.',path));if(!next||next===path)return;if(projectFiles.has(next)||projectFolders.has(next))return showToast('이미 존재하는 이름입니다.');
    if(kind==='file'){const code=projectFiles.get(path);projectFiles.delete(path);projectFiles.set(next,code);if(activePath===path)activePath=next;}
    else{projectFolders.delete(path);projectFolders.add(next);for(const [old,code] of [...projectFiles])if(old.startsWith(path+'/')){projectFiles.delete(old);const renamed=next+old.slice(path.length);projectFiles.set(renamed,code);if(activePath===old)activePath=renamed;}for(const old of [...projectFolders])if(old.startsWith(path+'/')){projectFolders.delete(old);projectFolders.add(next+old.slice(path.length));}}
    if(projectFiles.has(activePath))openProjectFile(activePath);else renderFileTree();showToast('이름을 변경했습니다.');return;
  }
  if(action==='delete'){
    if(!confirm(`'${path}' ${kind==='folder'?'폴더와 내부 파일':'파일'}을 삭제할까요?`))return;
    if(kind==='file'){projectFiles.delete(path);if(activePath===path)activePath='';}
    else{projectFolders.delete(path);for(const key of [...projectFiles.keys()])if(key.startsWith(path+'/')){projectFiles.delete(key);if(activePath===key)activePath='';}for(const key of [...projectFolders])if(key.startsWith(path+'/'))projectFolders.delete(key);}
    if(!projectFiles.has(activePath)){if(!projectFiles.size)projectFiles.set('main.ep','');openProjectFile(projectFiles.keys().next().value);}else renderFileTree();showToast('삭제했습니다.');
  }
}
document.addEventListener('click',e=>{if(!e.target.closest('#contextMenu'))$('contextMenu')?.classList.add('hidden');});

const help = [
  ["input(ask(...))","입력","질문을 표시하고 입력값을 받습니다. 숫자·불리언·none은 규칙에 따라 자동 변환됩니다.","name = input(ask(\"이름: \"))"],
  ["print(...)","출력","값을 화면 출력에 표시합니다.","print(\"Hello\", 42)"],
  ["upsort(list)","리스트","오름차순으로 정렬한 새 리스트를 반환합니다.","upsort([5, 2, 9, 1])"],
  ["downsort(list)","리스트","내림차순으로 정렬한 새 리스트를 반환합니다.","downsort([5, 2, 9, 1])"],
  ["only_upper(text)","문자열","대문자 알파벳을 추출합니다.","only_upper(\"Easy PEASY\")"],
  ["only_lower(text)","문자열","소문자 알파벳을 추출합니다.","only_lower(\"Easy PEASY\")"],
  ["digits(text)","문자열","문자열에서 숫자 문자를 추출합니다.","digits(\"A1B2C3\")"],
  ["letters(text)","문자열","문자열에서 글자 문자를 추출합니다.","letters(\"abc123한글\")"],
  ["length(value)","기본","문자열·리스트 등의 길이를 반환합니다.","length([1, 2, 3])"],
  ["first(list)","리스트","첫 번째 항목을 반환합니다.","first([10, 20, 30])"],
  ["last(list)","리스트","마지막 항목을 반환합니다.","last([10, 20, 30])"],
  ["sum(list)","수학","숫자 목록의 합을 계산합니다.","sum([1, 2, 3, 4])"],
  ["average(list)","수학","숫자 목록의 평균을 계산합니다.","average([10, 20, 30])"],
  ["random_int(a, b)","랜덤","a부터 b까지의 정수를 무작위로 반환합니다.","random_int(1, 100)"],
  ["random_choice(list)","랜덤","목록에서 임의의 항목 하나를 선택합니다.","random_choice([\"빨강\", \"노랑\"])"],
  ["is_even(number)","수학","짝수인지 확인합니다.","is_even(12)"],
  ["is_odd(number)","수학","홀수인지 확인합니다.","is_odd(7)"],
  ["repeat n:","제어 흐름","들여쓴 블록을 n번 반복합니다.","repeat 3:\\n    print(\"안녕\")"],
  ["if / else","제어 흐름","조건에 따라 코드를 실행합니다.","if age >= 18:\\n    print(\"성인\")\\nelse:\\n    print(\"미성년자\")"],
  ["for / range","제어 흐름","숫자 범위를 반복합니다.","for i in range(1, 5):\\n    print(i)"],
  ["리스트","자료형","대괄호로 목록을 만듭니다.","numbers = [1, 2, 3]"]
];

function buildSearchCatalog(){
 const items=help.map(x=>({title:x[0],category:x[1],description:x[2],code:x[3]}));
 const add=(title,category,description,code)=>items.push({title,category,description,code});
 const builtins={abs:'abs(-12)',all:'all(values)',any:'any(values)',ascii:'ascii(text)',bin:'bin(number)',bool:'bool(value)',bytearray:'bytearray(8)',bytes:'bytes([65,66])',callable:'callable(func)',chr:'chr(65)',classmethod:'@classmethod',compile:'compile("1 + 2", "<expr>", "eval")',complex:'complex(2,3)',delattr:'delattr(obj, "name")',dict:'dict(name="Yul")',dir:'dir(str)',divmod:'divmod(17,5)',enumerate:'enumerate(items, start=1)',eval:'eval("2 + 3")',exec:'exec("print(1)")',filter:'filter(predicate, items)',float:'float("3.14")',format:'format(3.14159, ".2f")',frozenset:'frozenset(values)',getattr:'getattr(obj, "name", None)',globals:'globals()',hasattr:'hasattr(obj, "name")',hash:'hash("hello")',help:'help(str)',hex:'hex(255)',id:'id(obj)',input:'input("이름: ")',int:'int("42")',isinstance:'isinstance(value, int)',issubclass:'issubclass(bool, int)',iter:'iter(items)',len:'len(items)',list:'list(range(5))',locals:'locals()',map:'map(str, items)',max:'max(values)',memoryview:'memoryview(b"abc")',min:'min(values)',next:'next(iterator, None)',object:'class Item(object):\n    pass',oct:'oct(64)',open:'with open("data.txt", encoding="utf-8") as file:\n    text = file.read()',ord:'ord("A")',pow:'pow(2, 8)',print:'print("Hello", name)',property:'@property',range:'range(1, 10, 2)',repr:'repr(value)',reversed:'list(reversed(items))',round:'round(3.14159, 2)',set:'set(values)',setattr:'setattr(obj, "name", "Yul")',slice:'items[slice(1, 5, 2)]',sorted:'sorted(items, reverse=True)',staticmethod:'@staticmethod',str:'str(123)',sum:'sum(values)',super:'super().__init__()',tuple:'tuple(values)',type:'type(value)',vars:'vars(obj)',zip:'zip(names, scores)'};
 for(const [name,code] of Object.entries(builtins))add(name,'Python 내장 함수',`${name} 내장 함수의 검색 가능한 예제입니다.`,code);
 const types={str:'capitalize casefold center count encode endswith expandtabs find format format_map index isalnum isalpha isascii isdecimal isdigit isidentifier islower isnumeric isprintable isspace istitle isupper join ljust lower lstrip maketrans partition removeprefix removesuffix replace rfind rindex rjust rpartition rsplit rstrip split splitlines startswith strip swapcase title translate upper zfill'.split(' '),list:'append clear copy count extend index insert pop remove reverse sort'.split(' '),dict:'clear copy fromkeys get items keys pop popitem setdefault update values'.split(' '),set:'add clear copy difference difference_update discard intersection intersection_update isdisjoint issubset issuperset pop remove symmetric_difference symmetric_difference_update union update'.split(' '),tuple:'count index'.split(' '),file:'close flush read readable readline readlines seek seekable tell truncate writable write writelines'.split(' '),pathlib:'absolute as_posix chmod exists expanduser glob is_dir is_file iterdir mkdir open parent parts read_bytes read_text rename resolve rmdir stem suffix unlink write_bytes write_text'.split(' ')};
 for(const [type,names] of Object.entries(types))for(const name of names){const v=type==='str'?'text':type==='list'?'items':type==='dict'?'data':type==='set'?'values':type==='tuple'?'pair':type==='file'?'file':'path';add(`${type}.${name}()`,'자료형 메서드',`${type} 자료형에서 사용하는 ${name} 메서드 예제입니다.`,`${v}.${name}()`);}
 const modules={math:'ceil copysign fabs factorial floor fmod fsum gcd isclose isfinite isinf isnan lcm modf prod sqrt trunc comb exp exp2 log log10 log2 pow sin cos tan asin acos atan degrees radians hypot pi e tau'.split(' '),random:'choice choices randint randrange sample seed shuffle uniform getrandbits'.split(' '),statistics:'mean fmean geometric_mean harmonic_mean median median_low median_high mode multimode pstdev pvariance stdev variance quantiles'.split(' '),datetime:'date datetime time timedelta timezone'.split(' '),json:'dump dumps load loads JSONDecoder JSONEncoder'.split(' '),os:'chdir getcwd listdir makedirs mkdir remove rename replace rmdir walk environ path'.split(' '),re:'compile escape findall finditer fullmatch match search split sub subn'.split(' '),collections:'Counter defaultdict deque namedtuple OrderedDict ChainMap'.split(' '),itertools:'accumulate chain combinations combinations_with_replacement compress count cycle dropwhile filterfalse groupby islice pairwise permutations product repeat starmap takewhile tee zip_longest'.split(' '),functools:'cache cached_property cmp_to_key lru_cache partial reduce wraps'.split(' '),time:'asctime ctime gmtime localtime monotonic perf_counter sleep strftime strptime time'.split(' '),csv:'DictReader DictWriter reader writer'.split(' '),sys:'argv exit path platform version'.split(' '),typing:'Any Callable Iterable Iterator Literal Optional Protocol Sequence TypeVar Union'.split(' '),hashlib:'md5 sha1 sha256 sha512 blake2b'.split(' '),heapq:'heapify heappop heappush heappushpop heapreplace merge nlargest nsmallest'.split(' '),bisect:'bisect bisect_left bisect_right insort insort_left insort_right'.split(' '),logging:'basicConfig debug info warning error exception critical'.split(' '),shutil:'copy copy2 copytree move rmtree which'.split(' '),glob:'glob iglob escape'.split(' '),textwrap:'dedent fill indent shorten wrap'.split(' '),decimal:'Decimal getcontext'.split(' '),fractions:'Fraction'.split(' '),dataclasses:'dataclass field asdict astuple replace'.split(' '),inspect:'getmembers signature isclass isfunction ismethod'.split(' '),asyncio:'run gather create_task sleep wait'.split(' '),threading:'Thread Lock Event Semaphore'.split(' '),socket:'socket create_connection gethostname'.split(' '),base64:'b64encode b64decode urlsafe_b64encode'.split(' '),secrets:'choice token_bytes token_hex token_urlsafe'.split(' '),tempfile:'TemporaryDirectory NamedTemporaryFile'.split(' '),traceback:'format_exc print_exc'.split(' '),calendar:'calendar month monthrange isleap'.split(' '),copy:'copy deepcopy'.split(' '),pickle:'dump dumps load loads'.split(' '),configparser:'ConfigParser'.split(' ')};
 for(const [mod,names] of Object.entries(modules))for(const name of names)add(`${mod}.${name}`,'Python 표준 라이브러리',`${mod} 모듈의 ${name} API 참고 항목입니다.`,`import ${mod}\n${mod}.${name}`);
 const snippets=[['if 조건문','if condition:\n    print("참")'],['if/else','if score >= 60:\n    print("합격")\nelse:\n    print("불합격")'],['elif 분기','if score >= 90:\n    grade = "A"\nelif score >= 80:\n    grade = "B"\nelse:\n    grade = "C"'],['for 반복','for item in items:\n    print(item)'],['while 반복','while condition:\n    do_work()'],['함수 정의','def greet(name):\n    return f"안녕, {name}"'],['기본값 매개변수','def greet(name, greeting="안녕"):\n    return f"{greeting}, {name}"'],['리스트 컴프리헨션','squares = [n*n for n in range(10)]'],['조건 컴프리헨션','evens = [n for n in numbers if n % 2 == 0]'],['딕셔너리 컴프리헨션','lookup = {word: len(word) for word in words}'],['예외 처리','try:\n    value = int(text)\nexcept ValueError as error:\n    print(error)'],['파일 읽기','with open("input.txt", encoding="utf-8") as file:\n    text = file.read()'],['파일 쓰기','with open("output.txt", "w", encoding="utf-8") as file:\n    file.write("Hello")'],['클래스 정의','class Person:\n    def __init__(self, name):\n        self.name = name'],['상속','class Student(Person):\n    def __init__(self, name):\n        super().__init__(name)'],['람다','sorted(words, key=lambda word: len(word))'],['enumerate','for i, item in enumerate(items, start=1):\n    print(i, item)'],['zip','for name, score in zip(names, scores):\n    print(name, score)'],['정렬 key','sorted(items, key=lambda item: item["score"], reverse=True)'],['슬라이싱','middle = items[1:-1]'],['언패킹','first, second, *rest = values'],['f-string','message = f"{name}: {score:.1f}"'],['타입 힌트','def add(a: int, b: int) -> int:\n    return a + b'],['제너레이터','def count_up(limit):\n    for number in range(limit):\n        yield number'],['메인 가드','if __name__ == "__main__":\n    main()'],['assert 검사','assert result == expected, "결과가 다릅니다"'],['모듈 가져오기','import math\nfrom pathlib import Path']];
 for(const [title,code] of snippets)add(title,'자주 쓰는 Python 문법',`${title} 예제입니다.`,code);
 const patterns=['리스트 추가','리스트 삭제','리스트 복사','리스트 정렬','리스트 역순','리스트 길이','리스트 최댓값','리스트 최솟값','리스트 합계','리스트 중복 제거','문자열 대문자','문자열 소문자','문자열 공백 제거','문자열 분리','문자열 결합','문자열 치환','딕셔너리 키 목록','딕셔너리 값 목록','딕셔너리 순회','딕셔너리 기본값','집합 합집합','집합 교집합','집합 차집합','튜플 언패킹'];
 for(const title of patterns){const [type,op]=title.split(' ');const code=title.includes('추가')?'items.append(value)':title.includes('삭제')?'items.remove(value)':title.includes('복사')?'items.copy()':title.includes('정렬')?'sorted(items)':title.includes('역순')?'list(reversed(items))':title.includes('길이')?'len(items)':title.includes('최댓값')?'max(items)':title.includes('최솟값')?'min(items)':title.includes('합계')?'sum(items)':title.includes('중복')?'list(dict.fromkeys(items))':title.includes('대문자')?'text.upper()':title.includes('소문자')?'text.lower()':title.includes('공백')?'text.strip()':title.includes('분리')?'text.split(",")':title.includes('결합')?'", ".join(words)':title.includes('치환')?'text.replace(old, new)':title.includes('키 목록')?'list(data.keys())':title.includes('값 목록')?'list(data.values())':title.includes('순회')?'for key, value in data.items():\n    print(key, value)':title.includes('기본값')?'data.get(key, default)':title.includes('합집합')?'left | right':title.includes('교집합')?'left & right':title.includes('차집합')?'left - right':'first, second = pair';add(title,'실전 코드 패턴',`${title}을 위한 코드 패턴입니다.`,code);}
 const unique=[];const seen=new Set();for(const item of items){const key=item.title+'|'+item.code;if(!seen.has(key)){seen.add(key);unique.push(item);}}return unique.slice(0,1000);
}
const searchCatalog=buildSearchCatalog();
// Expand the searchable reference with practical combinations of common operations.
// These are templates; they are explicitly Python references, not EasyPeasy runtime promises.
if(searchCatalog.length<1000){
  const vars=[['items','리스트'],['numbers','숫자 목록'],['scores','점수 목록'],['names','이름 목록'],['words','단어 목록'],['values','값 목록'],['records','레코드 목록'],['results','결과 목록'],['data','데이터'],['users','사용자 목록'],['ages','나이 목록'],['prices','가격 목록'],['products','상품 목록'],['students','학생 목록'],['grades','성적 목록'],['cities','도시 목록'],['letters','문자 목록'],['temperatures','온도 목록'],['tasks','작업 목록'],['files','파일 목록'],['paths','경로 목록'],['events','이벤트 목록'],['messages','메시지 목록'],['points','점수 데이터'],['ids','ID 목록'],['colors','색상 목록'],['questions','질문 목록'],['answers','답변 목록'],['orders','주문 목록'],['employees','직원 목록'],['books','책 목록'],['movies','영화 목록'],['logs','로그 목록'],['rows','행 데이터'],['columns','열 데이터']];
  const ops=[['길이','len(V)'],['정렬','sorted(V)'],['역순 정렬','sorted(V, reverse=True)'],['최솟값','min(V)'],['최댓값','max(V)'],['합계','sum(V)'],['중복 제거','list(dict.fromkeys(V))'],['인덱스와 값','list(enumerate(V))'],['복사','V.copy()'],['슬라이스','V[1:-1]'],['첫 항목','V[0]'],['마지막 항목','V[-1]'],['앞 3개','V[:3]'],['뒤 3개','V[-3:]'],['반복','for item in V:\n    print(item)'],['필터링','[item for item in V if condition]'],['변환','[transform(item) for item in V]'],['개수 세기','V.count(target)'],['포함 여부','target in V'],['인덱스 찾기','V.index(target)'],['최대 길이','max(V, key=len)'],['키 기준 정렬','sorted(V, key=lambda item: item["name"])'],['조건 정렬','sorted(V, key=lambda item: item["score"], reverse=True)'],['두 목록 결합','list(zip(V, other))'],['조건에 맞는 개수','sum(1 for item in V if condition)']];
  outer: for(const [variable,label] of vars) for(const [operation,template] of ops){
    if(searchCatalog.length>=1000)break outer;
    const code=template.replaceAll('V',variable);
    searchCatalog.push({title:`${label} · ${operation} (${variable})`,category:'Python 실전 템플릿',description:`${variable} 변수에 적용하는 ${operation} 코드 예제입니다. 변수 이름과 조건을 실제 코드에 맞게 바꾸세요.`,code});
  }
}


function getCode() { return editor ? editor.getValue() : $("fallbackEditor").value; }
function setCode(code) {
  currentCode = code;
  if (editor) editor.setValue(code); else $("fallbackEditor").value = code;
  markDirty();
  runDiagnostics();
}
function markDirty() { $("dirtyDot").style.opacity = getCode() === savedCode ? "0" : "1"; }
function showToast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}
async function postJSON(url, body) {
  const response = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const err = new Error(data.error || `요청 실패 (${response.status})`); err.details = data; throw err; }
  return data;
}
function setPanel(name) {
  activePanel = name;
  for (const id of ["output","problems"]) {
    $(`${id}Panel`).classList.toggle("hidden", id !== name);
  }
  document.querySelectorAll(".panel-tab").forEach(b => b.classList.toggle("active", b.dataset.panel === name));
}
function renderProblems(diagnostics) {
  $("problemBadge").textContent = diagnostics.length;
  $("diagnosticCount").textContent = diagnostics.length ? `⚠ 오류 ${diagnostics.length}개` : "✓ 오류 없음";
  $("diagnosticCount").classList.toggle("has-errors", diagnostics.length > 0);
  $("problemsList").innerHTML = diagnostics.length ? diagnostics.map(d => `<button class="problem-item" data-line="${d.line}"><span class="problem-icon">${d.severity === "warning" ? "△" : "●"}</span><span>${escapeHTML(d.message)}<small>${escapeHTML(activePath)} · ${d.line}행, ${d.column}열</small></span></button>`).join("") : `<div class="empty-state">현재 표시할 문제가 없습니다.</div>`;
  $("problemsList").querySelectorAll("[data-line]").forEach(btn => btn.addEventListener("click", () => {
    const line = Number(btn.dataset.line);
    if (editor) { editor.revealLineInCenter(line); editor.setPosition({lineNumber:line,column:1}); editor.focus(); }
    setPanel("problems");
  }));
  if (editor && window.monaco) {
    const markers = diagnostics.map(d => ({
      severity: d.severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
      message: d.message, startLineNumber:d.line, startColumn:d.column,
      endLineNumber:d.line, endColumn:Math.max(d.endColumn || d.column+1, d.column+1)
    }));
    monaco.editor.setModelMarkers(editor.getModel(), "easypeasy", markers);
  }
}
let diagnosticTimer;
async function runDiagnostics() {
  const code = getCode();
  clearTimeout(diagnosticTimer);
  diagnosticTimer = setTimeout(async () => {
    try {
      const data = await postJSON("/api/diagnose", {code});
      if (code === getCode()) renderProblems(data.diagnostics || []);
    } catch {}
  }, 180);
}
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
async function collectTerminalInputs(code) {
  const matches = [...code.matchAll(/input\s*\(\s*(?:ask\s*\(\s*(["'])(.*?)\1\s*\)|(["'])(.*?)\3)?\s*\)/gs)];
  const inputs = [];
  const terminal = $("terminalInput");
  terminal.innerHTML = "";
  for (let i = 0; i < matches.length; i++) {
    const promptText = matches[i][2] ?? matches[i][4] ?? "입력하세요: ";
    const row = document.createElement("form");
    row.className = "terminal-prompt";
    const label = document.createElement("label"); label.textContent = promptText;
    const input = document.createElement("input"); input.type = "text"; input.autocomplete = "off"; input.setAttribute("aria-label", promptText);
    const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "입력";
    row.append(label, input, submit); terminal.appendChild(row);
    input.focus();
    const value = await new Promise(resolve => {
      row.addEventListener("submit", e => { e.preventDefault(); resolve(input.value); }, {once:true});
    });
    inputs.push(value);
    const echo = document.createElement("div"); echo.className = "console-text"; echo.textContent = `${promptText}${value}`;
    terminal.appendChild(echo);
    row.remove();
  }
  return inputs;
}
async function runCode() {
  const code = getCode();
  $("runButton").disabled = true; $("runButton").innerHTML = "실행 중…";
  setPanel("output"); $("outputText").textContent = ""; $("terminalInput").innerHTML = ""; $("runMeta").textContent = "";
  const start = performance.now();
  try {
    const inputs = await collectTerminalInputs(code);
    const data = await postJSON("/api/run", {code, inputs});
    $("outputText").textContent = data.output || "(출력이 없습니다.)";
    $("runMeta").textContent = `${Math.round(performance.now()-start)} ms · ${data.steps} steps · 실행 완료`;
  } catch (e) {
    const d = e.details || {};
    const location = d.line ? `\n위치: ${d.line}행${d.column ? ` ${d.column}열` : ""}` : "";
    $("outputText").textContent = `실행 오류${d.name ? ` (${d.name})` : ""}\n${e.message}${location}`;
    $("runMeta").textContent = `${Math.round(performance.now()-start)} ms · 실행 실패`;
    if (d.line && editor) { editor.revealLineInCenter(d.line); editor.setPosition({lineNumber:d.line,column:d.column||1}); }
    showToast("실행 오류의 종류와 위치를 출력 창에 표시했습니다.");
  } finally { $("runButton").disabled = false; $("runButton").innerHTML = '<span>▶</span> 실행 <kbd>Ctrl ↵</kbd>'; }
}
function renderHelp(query="") {
  const q=query.trim().toLowerCase();
  const matches=searchCatalog.filter(item=>`${item.title} ${item.category} ${item.description} ${item.code}`.toLowerCase().includes(q)).slice(0,100);
  $("helpResults").innerHTML=matches.map(item=>`<div class="help-result"><b>${escapeHTML(item.title)}</b><small>${escapeHTML(item.category)} · ${escapeHTML(item.description)}</small><button class="help-copy" data-copy="${searchCatalog.indexOf(item)}">복사</button></div>`).join("")||'<div class="side-note">검색 결과가 없습니다.</div>';
  $("helpResults").querySelectorAll('[data-copy]').forEach(btn=>btn.addEventListener('click',async()=>{const item=searchCatalog[Number(btn.dataset.copy)];try{await navigator.clipboard.writeText(item.code);showToast('예제 코드를 복사했습니다.')}catch{showToast('클립보드 권한을 허용해 주세요.')}}));
}

function openSidebar(view) {
  $("sidebar").classList.add("mobile-open");
  $("filesView").classList.toggle("hidden", view !== "files");
  $("helpView").classList.toggle("hidden", view !== "help");
  $("aiView").classList.toggle("hidden", view !== "ai");
  $("sideTitle").textContent = view === "files" ? "탐색기" : view === "help" ? "도움말" : "AI 도우미";
  document.querySelectorAll(".rail-button[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
}
function askAI() {
  const prompt = $("aiPrompt").value.trim();
  if (!prompt) { showToast("AI에게 요청할 내용을 입력하세요."); return; }
  const before = getCode();
  $("askAiButton").disabled = true; $("askAiButton").textContent = "응답 대기 중…";
  $("aiStatus").textContent = "현재 코드와 요청을 분석하고 있습니다.";
  $("aiResponse").classList.remove("hidden"); $("aiResponse").textContent = "응답을 기다리는 중…";
  postJSON("/api/ai", {code:before,prompt}).then(data => {
    pendingExplanation = data.explanation;
    $("aiResponse").textContent = data.explanation;
    if (typeof data.code === "string" && data.code !== before) {
      if (before !== getCode()) throw new Error("요청 중 편집기 내용이 변경되어 제안을 적용하지 않았습니다. 다시 요청해 주세요.");
      proposedCode = data.code;
      $("editExplanation").textContent = data.explanation;
      $("oldCode").textContent = before;
      $("newCode").textContent = proposedCode;
      $("editDialog").showModal();
      $("aiStatus").textContent = "수정 제안이 준비되었습니다. 비교한 뒤 적용하세요.";
    } else {
      $("aiStatus").textContent = "설명 완료. 코드 변경은 적용되지 않았습니다.";
    }
  }).catch(err => {
    $("aiStatus").textContent = err.message;
    $("aiResponse").textContent = err.message;
  }).finally(() => { $("askAiButton").disabled = false; $("askAiButton").textContent = "✳ AI에게 요청"; });
}
function applyAIEdit() {
  if (typeof proposedCode !== "string") return;
  if (getCode() !== $("oldCode").textContent) { showToast("편집기 내용이 바뀌어 제안을 취소했습니다."); $("editDialog").close(); return; }
  const before = getCode();
  pendingEdit = { id: crypto.randomUUID(), before, after: proposedCode, state:"pending" };
  setCode(proposedCode);
  $("editDialog").close();
  $("aiStatus").textContent = "수정이 실제 편집기에 적용되었습니다. 확정하거나 되돌릴 수 있습니다.";
  $("aiResponse").innerHTML = "";
  const text = document.createElement("p"); text.textContent = pendingExplanation; $("aiResponse").appendChild(text);
  const actions = document.createElement("div"); actions.className = "transaction-actions";
  const undo = document.createElement("button"); undo.className = "secondary-button"; undo.textContent = "↶ 되돌리기";
  const confirm = document.createElement("button"); confirm.className = "primary-button"; confirm.textContent = "✓ 확인";
  undo.onclick = () => {
    if (!pendingEdit || pendingEdit.state !== "pending") return;
    setCode(pendingEdit.before); pendingEdit.state = "reverted"; pendingEdit = null;
    $("aiStatus").textContent = "수정 전 코드로 되돌렸습니다."; actions.remove(); showToast("AI 수정이 되돌려졌습니다.");
  };
  confirm.onclick = () => {
    if (!pendingEdit || pendingEdit.state !== "pending") return;
    pendingEdit.state = "confirmed"; pendingEdit = null;
    savedCode = getCode(); markDirty();
    $("aiStatus").textContent = "이 수정이 확정되었습니다. 해당 AI 수정의 전용 되돌리기 기록을 제거했습니다.";
    actions.remove(); showToast("AI 수정이 확정되었습니다.");
  };
  actions.append(undo, confirm); $("aiResponse").appendChild(actions);
  showToast("AI 수정이 편집기에 적용되었습니다.");
}
function initEditor() {
  if (window.require && window.require.config) {
    require.config({paths:{vs:"https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs"}});
    require(["vs/editor/editor.main"], () => {
      monaco.languages.register({id:"easypeasy"});
      monaco.languages.setMonarchTokensProvider("easypeasy", {
        keywords:["if","else","elif","repeat","for","in","range","while","function","return","true","false","none","constant","and","or","not"],
        tokenizer:{root:[
          [/#.*$/, "comment"],
          [/"([^"\\\\]|\\\\.)*$/, "string.invalid"],
          [/"([^"\\\\]|\\\\.)*"/, "string"],
          [/'([^'\\\\]|\\\\.)*'/, "string"],
          [/\b\d+(\.\d+)?\b/, "number"],
          [/\b(if|else|elif|repeat|for|in|range|while|function|return|constant|and|or|not)\b/, "keyword"],
          [/\b(true|false|none)\b/, "constant"],
          [/\b(print|input|ask|upsort|downsort|only_upper|only_lower|digits|letters|length|average|sum|random_int|random_choice|is_even|is_odd)\b/, "predefined"],
          [/[a-zA-Z_]\w*/, "identifier"],
          [/[{}()\[\]]/, "@brackets"],
          [/[=><!~?:&|+\-*\/%^]+/, "operator"]
        ]}
      });
      monaco.editor.defineTheme("easypeasy-light", {base:"vs",inherit:true,rules:[{token:"keyword",foreground:"A16D00",fontStyle:"bold"},{token:"predefined",foreground:"6750A4"},{token:"comment",foreground:"929292",fontStyle:"italic"},{token:"string",foreground:"24815A"},{token:"number",foreground:"C04E31"},{token:"constant",foreground:"B54B73"}],colors:{"editor.background":"#FFFFFF","editorLineNumber.foreground":"#B7B7B7","editorLineNumber.activeForeground":"#222222","editor.lineHighlightBackground":"#FFFBE8","editor.selectionBackground":"#F8E7A8"}});
      editor = monaco.editor.create($("editor"), {value:sample,language:"easypeasy",theme:"easypeasy-light",automaticLayout:true,fontFamily:"DM Mono, monospace",fontSize:13,lineHeight:23,minimap:{enabled:false},scrollBeyondLastLine:false,renderLineHighlight:"all",padding:{top:16,bottom:16},tabSize:4,insertSpaces:true,wordWrap:"on",glyphMargin:true,suggest:{showWords:true},quickSuggestions:true});
      editor.onDidChangeModelContent(() => { currentCode = editor.getValue(); if(projectFiles.has(activePath)) projectFiles.set(activePath,currentCode); markDirty(); runDiagnostics(); });
      editor.onDidChangeCursorPosition(e => $("cursorStatus").textContent = `줄 ${e.position.lineNumber}, 열 ${e.position.column}`);
      $("fallbackEditor").style.display = "none";
      runDiagnostics();
    }, () => enableFallback());
  } else enableFallback();
}
function enableFallback() {
  fallback = true; $("editor").style.display = "none"; $("fallbackEditor").style.display = "block"; $("fallbackEditor").value = sample;
  $("fallbackEditor").addEventListener("input", () => { currentCode = getCode(); if(projectFiles.has(activePath)) projectFiles.set(activePath,currentCode); markDirty(); runDiagnostics(); });
}
async function checkHealth() {
  try {
    const r = await fetch("/api/health"); const d = await r.json();
    $("connection").classList.add("online"); $("connection").innerHTML = "<i></i> 서버 연결됨";
    $("aiStatus").textContent = d.geminiConfigured ? "AI 연결이 설정되어 있습니다." : "AI 연결 키가 없습니다. 프로젝트 루트의 .env를 확인하세요.";
  } catch { $("connection").textContent = "서버 연결 실패"; }
}
document.querySelectorAll(".panel-tab").forEach(b => b.addEventListener("click", () => setPanel(b.dataset.panel)));
document.querySelectorAll(".rail-button[data-view]").forEach(b => b.addEventListener("click", () => openSidebar(b.dataset.view)));
document.querySelectorAll(".mobile-nav button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".mobile-nav button").forEach(x => x.classList.toggle("active", x === b));
  if (b.dataset.mobile === "output") setPanel("output");
  else if (b.dataset.mobile === "problems") setPanel("problems");
  else if (b.dataset.mobile === "ai" || b.dataset.mobile === "files") openSidebar(b.dataset.mobile === "ai" ? "ai" : "files");
  else { $("sidebar").classList.remove("mobile-open"); }
}));
$("runButton").addEventListener("click", runCode);
$("askAiButton").addEventListener("click", askAI);
$("openAiFromRight").addEventListener("click", () => openSidebar("ai"));
$("toggleRightPanel").addEventListener("click", () => { const folded = $("rightPanel").classList.toggle("folded"); document.querySelector(".workspace").classList.toggle("right-folded", folded); });
$("helpButton").addEventListener("click", () => openSidebar("help"));
$("helpSearch").addEventListener("input", e => renderHelp(e.target.value));
$("applyEdit").addEventListener("click", applyAIEdit);
$("cancelEdit").addEventListener("click", () => $("editDialog").close());
$("clearOutput").addEventListener("click", () => { $("outputText").textContent = ""; $("runMeta").textContent = ""; });
$("togglePanel").addEventListener("click", () => $("bottomPanel").classList.toggle("collapsed"));
$("pythonButton").addEventListener("click", async () => {
  const source=getCode();
  let py=source.replace(/\binput\s*\(\s*ask\s*\(\s*(["'])(.*?)\1\s*\)\s*\)/g,'input("$2")').replace(/\btrue\b/g,"True").replace(/\bfalse\b/g,"False").replace(/\bnone\b/g,"None").replace(/\bfunction\s+(\w+)\s*\(/g,"def $1(").replace(/\brepeat\s+(.+):/g,"for _ in range($1):").replace(/\bupsort\(/g,"sorted(").replace(/\bdownsort\(([^()]*)\)/g,"sorted($1, reverse=True)").replace(/\brandom_int\(/g,"random.randint(").replace(/\brandom_choice\(/g,"random.choice(").replace(/\bis_even\(([^()]*)\)/g,"(($1) % 2 == 0)").replace(/\bis_odd\(([^()]*)\)/g,"(($1) % 2 != 0)");
  if(/random\.(?:randint|choice)\(/.test(py))py='import random\n'+py;
  $('outputText').textContent="# EasyPeasy → Python 변환 결과 (초안)\n"+py;$('runMeta').textContent='Python 변환 결과를 출력 창에 표시했습니다.';setPanel('output');
  try{await navigator.clipboard.writeText(py);showToast('변환된 Python 코드가 복사되었습니다.');}catch{showToast('변환 결과를 출력 창에 표시했습니다. 클립보드 권한을 확인하세요.');}
});
$("downloadButton").addEventListener("click", exportProject);
$("newFileButton").addEventListener("click", addProjectFile);
$("formatButton").addEventListener("click", () => {
  const formatted = getCode().split(/\r?\n/).map(line => line.replace(/[ \t]+$/g, "")).join("\n");
  setCode(formatted); showToast("줄 끝 공백을 정리했습니다.");
});
$("settingsButton").addEventListener("click", () => showToast("AI 연결 키는 프로젝트 루트의 .env에서 설정합니다."));
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runCode(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); $("downloadButton").click(); }
  if ((e.ctrlKey || e.metaKey) && e.key === "/") { e.preventDefault(); openSidebar("help"); $("helpSearch").focus(); }
});
renderHelp(); renderFileTree(); initEditor(); checkHealth();
