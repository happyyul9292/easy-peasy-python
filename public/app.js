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
 const unique=[];const seen=new Set();for(const item of items){const key=item.title+'|'+item.code;if(!seen.has(key)){seen.add(key);unique.push(item);}}return unique;
}
const searchCatalog=buildSearchCatalog();
// Expand the searchable reference with practical combinations of common operations.
// These are templates; they are explicitly Python references, not EasyPeasy runtime promises.
if(searchCatalog.length<2500){
  const vars=[['items','리스트'],['numbers','숫자 목록'],['scores','점수 목록'],['names','이름 목록'],['words','단어 목록'],['values','값 목록'],['records','레코드 목록'],['results','결과 목록'],['data','데이터'],['users','사용자 목록'],['ages','나이 목록'],['prices','가격 목록'],['products','상품 목록'],['students','학생 목록'],['grades','성적 목록'],['cities','도시 목록'],['letters','문자 목록'],['temperatures','온도 목록'],['tasks','작업 목록'],['files','파일 목록'],['paths','경로 목록'],['events','이벤트 목록'],['messages','메시지 목록'],['points','점수 데이터'],['ids','ID 목록'],['colors','색상 목록'],['questions','질문 목록'],['answers','답변 목록'],['orders','주문 목록'],['employees','직원 목록'],['books','책 목록'],['movies','영화 목록'],['logs','로그 목록'],['rows','행 데이터'],['columns','열 데이터'],['emails','이메일 목록'],['urls','URL 목록'],['cart','장바구니'],['inventory','재고 목록'],['payments','결제 목록'],['sessions','세션 목록'],['tokens','토큰 목록'],['settings','설정값'],['config','환경 설정'],['matrix','행렬'],['grid','격자'],['queue','대기열'],['stack','스택'],['history','기록 목록'],['cache','캐시'],['measurements','측정값'],['samples','표본 목록'],['coordinates','좌표 목록'],['translations','번역 목록'],['sentences','문장 목록'],['paragraphs','문단 목록'],['notifications','알림 목록'],['permissions','권한 목록'],['categories','분류 목록'],['tags','태그 목록'],['comments','댓글 목록'],['reviews','후기 목록'],['ratings','평점 목록'],['transactions','거래 목록'],['balances','잔액 목록'],['milestones','단계 목록'],['dependencies','의존성 목록'],['modules','모듈 목록'],['plugins','플러그인 목록'],['commands','명령 목록'],['arguments','인수 목록'],['options','옵션 목록'],['responses','응답 목록'],['requests','요청 목록'],['payloads','전송 데이터'],['headers','헤더 목록'],['cookies','쿠키 목록'],['students_by_id','학생별 데이터'],['scores_by_class','반별 점수'],['products_by_id','상품별 데이터'],['users_by_id','사용자별 데이터'],['events_by_day','날짜별 이벤트'],['sales_by_month','월별 매출'],['tasks_by_status','상태별 작업'],['words_by_count','빈도별 단어'],['items_by_type','종류별 항목'],['results_by_name','이름별 결과'],['records_by_date','날짜별 기록'],['prices_by_code','코드별 가격'],['points_by_level','레벨별 점수'],['answers_by_question','질문별 답변'],['books_by_author','작가별 도서'],['logs_by_level','수준별 로그'],['files_by_name','이름별 파일'],['users_by_role','역할별 사용자'],['orders_by_status','상태별 주문'],['messages_by_room','방별 메시지']];
  const ops=[['길이','len(V)'],['정렬','sorted(V)'],['역순 정렬','sorted(V, reverse=True)'],['최솟값','min(V)'],['최댓값','max(V)'],['합계','sum(V)'],['중복 제거','list(dict.fromkeys(V))'],['인덱스와 값','list(enumerate(V))'],['복사','V.copy()'],['슬라이스','V[1:-1]'],['첫 항목','V[0]'],['마지막 항목','V[-1]'],['앞 3개','V[:3]'],['뒤 3개','V[-3:]'],['반복','for item in V:\n    print(item)'],['필터링','[item for item in V if condition]'],['변환','[transform(item) for item in V]'],['개수 세기','V.count(target)'],['포함 여부','target in V'],['인덱스 찾기','V.index(target)'],['최대 길이','max(V, key=len)'],['키 기준 정렬','sorted(V, key=lambda item: item["name"])'],['조건 정렬','sorted(V, key=lambda item: item["score"], reverse=True)'],['두 목록 결합','list(zip(V, other))'],['조건에 맞는 개수','sum(1 for item in V if condition)'],['첫 항목 제외','V[1:]'],['마지막 항목 제외','V[:-1]'],['짝수 위치 항목','V[::2]'],['홀수 위치 항목','V[1::2]'],['목록 이어 붙이기','V + other'],['목록 반복','V * 2'],['평균 계산','sum(V) / len(V)'],['특정 값 개수','V.count(target)'],['모든 값 검사','all(condition for item in V)'],['하나라도 검사','any(condition for item in V)'],['키 존재 확인','key in V'],['안전한 기본값','V.get(key, default)'],['키와 값 쌍','list(V.items())'],['키만 추출','list(V.keys())'],['값만 추출','list(V.values())'],['항목 묶기','list(zip(V, other))'],['문자열 합치기','separator.join(V)'],['문자열 분리','text.split(separator)'],['공백 제거','text.strip()'],['접두사 확인','text.startswith(prefix)'],['접미사 확인','text.endswith(suffix)'],['부분 문자열 바꾸기','text.replace(old, new)'],['문자열 대문자','text.upper()'],['문자열 소문자','text.lower()'],['문자열 숫자 검사','text.isdigit()'],['문자열 글자 검사','text.isalpha()'],['파일 경로 확장자','path.suffix'],['JSON 읽기','json.loads(text)'],['JSON 만들기','json.dumps(data, ensure_ascii=False)'],['날짜 현재 시각','datetime.now()'],['랜덤 항목 선택','random.choice(V)'],['최대 N개','sorted(V, reverse=True)[:n]'],['정렬된 고유 값','sorted(set(V))'],['딕셔너리 기본값 설정','V.setdefault(key, default)'],['항목 위치 찾기','V.index(target)'],['항목 삭제 후 반환','V.pop()'],['새 항목 추가','V.append(value)'],['여러 항목 추가','V.extend(other)'],['항목 삽입','V.insert(index, value)'],['목록 비우기','V.clear()'],['목록 복사','V.copy()'],['문자열 시작 문자 제거','text.lstrip()'],['문자열 끝 문자 제거','text.rstrip()'],['문자열 단어별 분리','text.split()'],['문자열 줄별 분리','text.splitlines()'],['숫자 반올림','round(value, 2)'],['절댓값','abs(value)'],['거듭제곱','pow(base, exponent)'],['최솟값과 최댓값','min(V), max(V)'],['정렬 후 일부 선택','sorted(V)[:count]'],['조건에 맞는 목록','[item for item in V if condition]'],['값 변환 목록','[transform(item) for item in V]'],['번호와 항목','list(enumerate(V, start=1))'],['목록 합치기','V + other'],['문자열 포함 여부','part in text'],['대소문자 무시 비교','left.lower() == right.lower()'],['문자열 길이','len(text)'],['문자열 반복','text * count'],['문자열 앞부분','text[:count]'],['문자열 뒷부분','text[-count:]']];
  outer: for(const [variable,label] of vars) for(const [operation,template] of ops){
    if(searchCatalog.length>=2500)break outer;
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
  if($("helpCount")) $("helpCount").textContent = `검색 가능한 항목 ${searchCatalog.length.toLocaleString()}개 · 현재 ${matches.length}개 표시` + (q ? ` · 검색어: ${query.trim()}` : '');
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
let aiBusy = false;
const aiConversation = [];
function addChatBubble(text, role='assistant', extraClass='') {
  const log = $('aiChatLog'); if (!log) return null;
  const node = document.createElement('div'); node.className = `chat-bubble ${role} ${extraClass}`.trim(); node.textContent = text;
  log.appendChild(node); log.scrollTop = log.scrollHeight; return node;
}
function askAI() {
  if (aiBusy) return;
  const prompt = $('aiPrompt').value.trim();
  if (!prompt) { showToast('AI에게 요청할 내용을 입력하세요.'); return; }
  const before = getCode(); aiBusy = true;
  addChatBubble(prompt, 'user'); aiConversation.push({role:'user',text:prompt}); $('aiPrompt').value = '';
  const waiting = addChatBubble('답변을 준비하고 있어요', 'assistant', 'pending');
  const waitingStartedAt = Date.now();
  const waitingTicker = setInterval(() => { if (waiting?.isConnected) { const seconds = Math.floor((Date.now() - waitingStartedAt) / 1000); waiting.textContent = `답변을 준비하고 있어요${'.'.repeat(1 + (seconds % 3))} (${Math.floor(seconds / 60)}분 ${seconds % 60}초)`; } }, 1000);
  $('askAiButton').disabled = true; $('askAiButton').textContent = '응답 중…';
  $('aiStatus').textContent = 'EasyPeasy 지원 문법을 기준으로 확인하고 있습니다.';
  postJSON('/api/ai', {code:before,prompt,history:aiConversation.slice(0,-1).slice(-12)}).then(async data => {
    clearInterval(waitingTicker); waiting?.remove(); pendingExplanation = data.explanation || '답변을 받았습니다.';
    addChatBubble(pendingExplanation, 'assistant'); aiConversation.push({role:'assistant',text:pendingExplanation});
    if (typeof data.code === 'string' && data.code !== before) {
      if (before !== getCode()) throw new Error('요청 중 편집기 내용이 변경되어 제안을 적용하지 않았습니다. 다시 요청해 주세요.');
      // Client-side final guard: never silently offer code with obvious parser errors.
      const checked = await postJSON('/api/diagnose', {code:data.code});
      const errors = (checked.diagnostics || []).filter(d => d.severity === 'error');
      if (errors.length) {
        addChatBubble(`수정안에서 문법 검사 오류 ${errors.length}개가 발견되어 자동 적용을 막았습니다. 첫 오류: ${errors[0].message} (${errors[0].line}행)`, 'assistant');
        $('aiStatus').textContent = '수정안이 검증을 통과하지 못해 적용하지 않았습니다.'; return;
      }
      proposedCode = data.code; $('editExplanation').textContent = data.explanation;
      $('oldCode').textContent = before; $('newCode').textContent = proposedCode;
      $('editDialog').showModal(); $('aiStatus').textContent = '수정안을 검사했습니다. 비교 후 적용할 수 있습니다.';
    } else {
      $('aiStatus').textContent = '답변 완료. 코드 변경이 필요하지 않아 수정안을 만들지 않았습니다.';
    }
  }).catch(err => {
    clearInterval(waitingTicker); waiting?.remove(); const errorText=`요청을 완료하지 못했습니다: ${err.message}`; addChatBubble(errorText, 'assistant'); aiConversation.push({role:'assistant',text:errorText});
    $('aiStatus').textContent = err.message;
  }).finally(() => { clearInterval(waitingTicker); waiting?.remove(); aiBusy = false; $('askAiButton').disabled = false; $('askAiButton').textContent = '보내기 ↑'; });
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
  if (b.dataset.mobile === "ai" || b.dataset.mobile === "files") openSidebar(b.dataset.mobile);
  else { $("sidebar").classList.remove("mobile-open"); }
}));
$("runButton").addEventListener("click", runCode);
$("askAiButton").addEventListener("click", askAI);
$("aiPrompt").addEventListener("keydown", e => { if(e.key === 'Enter' && !e.shiftKey){e.preventDefault();askAI();} });
$("brandHome").addEventListener("click", e => { e.preventDefault(); if(getCode() !== savedCode && !confirm('저장하지 않은 코드가 있습니다. 새로고침할까요?')) return; location.reload(); });
$("clearCodeButton").addEventListener("click", () => { if(!getCode()) return showToast('이미 코드가 비어 있습니다.'); if(!confirm('현재 파일의 코드를 모두 지울까요?')) return; setCode(''); showToast('현재 파일의 코드를 모두 지웠습니다.'); });
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
$("convertButton").addEventListener("click", async () => {
  const source=getCode().trim(); if(!source) return showToast('변환할 코드를 입력하세요.');
  const language=(prompt('원본 코드의 언어를 입력하세요 (예: Python, JavaScript, Java, C++)','Python')||'').trim(); if(!language)return;
  const button=$('convertButton'); button.disabled=true; button.textContent='AI 변환 중…'; $('aiStatus').textContent='변환 요청 처리 중입니다. 최대 10분까지 걸릴 수 있습니다.';
  try {
    const data=await postJSON('/api/convert',{source,language});
    if(!data.code) throw new Error(data.error||'변환 결과가 비어 있습니다.');
    $('oldCode').textContent=source; $('newCode').textContent=data.code; $('editExplanation').textContent=`${language}에서 EasyPeasy로 변환했습니다. 지원하지 않는 기능은 설명에 표시됩니다.

${data.explanation||''}`;
    proposedCode=data.code; pendingExplanation=data.explanation||'언어 변환 결과'; $('editDialog').showModal();
    $('aiStatus').textContent='변환 결과를 검토한 뒤 편집기에 적용하세요.'; openSidebar('ai');
  } catch(err) { showToast(`변환 실패: ${err.message}`); }
  finally { button.disabled=false; button.textContent='⇄ 다른 언어 → EP'; $('aiStatus').textContent='변환 요청이 종료되었습니다.'; }
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
