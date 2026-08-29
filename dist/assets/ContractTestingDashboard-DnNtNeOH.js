import{r as m,j as t}from"./react-vendor-qY_IYXou.js";import"./vendor-ngnjCXE0.js";const ue=["Address","Symbol","String","BytesN","Bytes","Vec","Map","u32","u64","u128","i32","i64","i128","bool"];function he(e){const n=e.trim().replace(/^&\s*/,"").replace(/^mut\s+/,"");for(const s of ue)if(n===s||n.startsWith(`${s}<`)||n.startsWith(`${s}(`))return s;return"unknown"}function pe(e,n=","){const s=[];let r=0,i="";for(const a of e)a==="<"||a==="("||a==="["?r++:(a===">"||a===")"||a==="]")&&(r=Math.max(0,r-1)),a===n&&r===0?(s.push(i),i=""):i+=a;return i.trim().length>0&&s.push(i),s.map(a=>a.trim()).filter(a=>a.length>0)}function J(e,n){let s=0;for(let r=n;r<e.length;r++)if(e[r]==="{")s++;else if(e[r]==="}"&&(s--,s===0))return r+1;return e.length}function Q(e,n){return e.slice(0,n).split(`
`).length}function me(e){return pe(e).filter(n=>n!=="self"&&n!=="&self"&&n!=="&mut self").map(n=>{const s=n.indexOf(":");if(s===-1)return{name:n.trim(),type:"unknown",kind:"unknown"};const r=n.slice(0,s).trim(),i=n.slice(s+1).trim();return{name:r,type:i,kind:he(i)}}).filter(n=>n.type!=="Env")}function ye(e){const n=(e.match(/\bif\s+/g)??[]).length,s=(e.match(/\bmatch\s+/g)??[]).length,r=(e.match(/\b(for|while)\s+/g)??[]).length,i=(e.match(/\?[\s;)]/g)??[]).length;return n+s+r+i}function ge(e){const n=/\.require_auth(_for_args)?\s*\(/.test(e),s=/[^=!<>]=?\s*[a-zA-Z0-9_)\]]\s*[+\-*]\s*[a-zA-Z0-9_(]/.test(e),r=/\.checked_(add|sub|mul|div)\s*\(/.test(e),i=/\.storage\(\)[\s\S]{0,40}\.(set|extend_ttl|bump)\s*\(/.test(e),a=/\bpanic!\s*\(|\.unwrap\s*\(\)|\.expect\s*\(/.test(e),o=/\.invoke_contract(_check_args)?\s*::?</.test(e)||/env\.invoke_contract/.test(e);return{hasAuthCheck:n,hasUncheckedArithmetic:s&&!r,hasPanicRisk:a,hasExternalCall:o,hasStorageWrite:i,branchCount:ye(e)}}const q=/pub\s+fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(->\s*([^\{]+))?\s*\{/g;function fe(e,n,s){const r=e.slice(n,s),i=[];q.lastIndex=0;let a;for(;a=q.exec(r);){const[,o,d,,y]=a,x=n+a.index+a[0].length-1,u=J(e,x),h=e.slice(x,u),p=ge(h);i.push({name:o,params:me(d),returnType:y?y.trim():null,line:Q(e,n+a.index),isPublic:!0,mutatesState:p.hasStorageWrite,...p})}return i}function xe(e){const n=[],s=/#\[contracttype\][\s\S]{0,80}?pub\s+(struct|enum)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;let r;for(;r=s.exec(e);)n.push({name:r[2],kind:r[1],line:Q(e,r.index)});return n}function ve(e){const n=/#\[contract\][\s\S]{0,80}?pub\s+struct\s+([a-zA-Z_][a-zA-Z0-9_]*)/.exec(e);return n?n[1]:"Contract"}function be(e){const n=[],s=/#\[contractimpl\]/g;let r;for(;r=s.exec(e);){const i=e.indexOf("{",r.index);if(i===-1)continue;const a=J(e,i);n.push(...fe(e,i,a)),s.lastIndex=a}return{contractName:ve(e),functions:n,types:xe(e),lineCount:e.split(`
`).length,usesStorage:n.some(i=>i.hasStorageWrite)||/\.storage\(\)/.test(e),usesCrossContractCalls:n.some(i=>i.hasExternalCall)}}const je=/^(admin|owner|withdraw|mint|burn|set_|upgrade|initialize|transfer|remove_|revoke|release|claim|close|pause|unpause|deposit|redeem)/i;let W=0;function b(e){return W+=1,`${e}-${W.toString(36)}`}function we(e){const n=[];return e.mutatesState&&!e.hasAuthCheck&&je.test(e.name)?n.push({id:b("finding"),severity:"critical",category:"access-control",functionName:e.name,line:e.line,message:`\`${e.name}\` mutates contract state but no \`require_auth\`/\`require_auth_for_args\` call was found in its body.`,recommendation:"Call `.require_auth()` on the authorizing `Address` parameter before any state mutation, or document why this function is intentionally unauthenticated."}):e.mutatesState&&!e.hasAuthCheck&&n.push({id:b("finding"),severity:"medium",category:"access-control",functionName:e.name,line:e.line,message:`\`${e.name}\` writes to storage without an observed \`require_auth\` call.`,recommendation:"Confirm this function is meant to be callable by any address; add `require_auth()` if not."}),e.hasUncheckedArithmetic&&n.push({id:b("finding"),severity:"high",category:"arithmetic",functionName:e.name,line:e.line,message:`\`${e.name}\` performs arithmetic without a visible \`checked_add\`/\`checked_sub\`/\`checked_mul\`/\`checked_div\` guard.`,recommendation:"Use the `checked_*` variants (or `saturating_*` where overflow should clamp) and handle the `None` case explicitly instead of relying on WASM trap behavior."}),e.hasPanicRisk&&n.push({id:b("finding"),severity:"medium",category:"panic-safety",functionName:e.name,line:e.line,message:`\`${e.name}\` contains \`panic!\`, \`.unwrap()\`, or \`.expect()\`, which aborts the whole transaction on failure.`,recommendation:"Prefer returning a typed `Result`/contract error so callers can handle failure without a full trap where practical."}),e.hasExternalCall&&e.hasStorageWrite&&n.push({id:b("finding"),severity:"high",category:"reentrancy",functionName:e.name,line:e.line,message:`\`${e.name}\` both performs a cross-contract call and writes to storage; verify state is finalized before the external call (checks-effects-interactions).`,recommendation:"Apply the checks-effects-interactions pattern: validate, update local state, then invoke the external contract last."}),e.branchCount===0&&e.mutatesState&&n.push({id:b("finding"),severity:"info",category:"resource-usage",functionName:e.name,line:e.line,message:`\`${e.name}\` has no visible input validation branches before mutating state.`,recommendation:"Confirm input parameters are validated (bounds, non-zero amounts, allowed callers) even when logic looks straightforward."}),n}function Ce(e){const n=e.functions.flatMap(we);return e.usesStorage&&e.functions.every(s=>!s.hasStorageWrite)&&n.push({id:b("finding"),severity:"info",category:"storage-growth",functionName:null,line:null,message:"Contract references `env.storage()` but no parsed function shows a matching `.set()`/`.bump()` call — storage lifecycle management may live outside the scanned functions.",recommendation:"Confirm TTL extension (`extend_ttl`/`bump`) is applied to persistent entries to avoid unexpected archival."}),n}function _e(e){const n=[];for(const s of e.functions)s.hasUncheckedArithmetic&&n.push({id:b("invariant"),functionName:s.name,description:`Numeric state touched by \`${s.name}\` never goes negative or overflows its integer width.`,expression:`forall inputs: ${s.name}(..) does not panic and result >= 0`}),s.mutatesState&&s.hasAuthCheck&&n.push({id:b("invariant"),functionName:s.name,description:`\`${s.name}\` only mutates state for the authorized caller.`,expression:`forall caller != authorized_address: ${s.name}(..) called by caller fails require_auth`}),s.params.some(r=>r.kind==="i128"||r.kind==="u128"||r.kind==="u32")&&n.push({id:b("invariant"),functionName:s.name,description:`\`${s.name}\` handles boundary numeric inputs (0, max, and negative-where-applicable) without an unhandled panic.`,expression:`forall n in {MIN, 0, MAX}: ${s.name}(n) either succeeds or returns a typed error`});return n}let K=0;function A(e){return K+=1,`${e}-${K.toString(36)}`}function U(e){switch(e.kind){case"Address":return"Address::generate(&env)";case"Symbol":return`symbol_short!("${e.name.slice(0,8)||"val"}")`;case"String":return`String::from_str(&env, "${e.name}")`;case"BytesN":return"BytesN::from_array(&env, &[7u8; 32])";case"Bytes":return"Bytes::from_array(&env, &[1, 2, 3, 4])";case"Vec":return"Vec::new(&env)";case"Map":return"Map::new(&env)";case"u32":return"10u32";case"u64":return"10u64";case"u128":return"10u128";case"i32":return"10i32";case"i64":return"10i64";case"i128":return"10i128";case"bool":return"true";default:return`/* TODO: supply a value for ${e.name}: ${e.type} */ Default::default()`}}const L={u32:["0u32","u32::MAX"],u64:["0u64","u64::MAX"],u128:["0u128","u128::MAX"],i32:["i32::MIN","0i32","i32::MAX"],i64:["i64::MIN","0i64","i64::MAX"],i128:["i128::MIN","0i128","i128::MAX"]};function ee(e,n){return e.map(s=>n(s)).join(", ")}function ke(e,n){const s=ee(e.params,U),r=`#[test]
fn ${e.name}_happy_path() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ${n});
    let client = ${n}Client::new(&env, &contract_id);
    let result = client.${e.name}(${s});
    // TODO: assert on the concrete return value/state this contract expects.
    let _ = result;
}`;return{id:A("test"),kind:"unit",name:`${e.name}_happy_path`,functionName:e.name,description:`Exercises \`${e.name}\` with representative valid arguments and asserts it does not trap.`,code:r,estimatedCoverageGain:1.5}}function Se(e,n){const s=e.params.find(d=>L[d.kind]);if(!s)return null;const r=L[s.kind]??[],i=ee(e.params,d=>d===s?r[r.length-1]:U(d)),o=`${e.hasUncheckedArithmetic?`#[should_panic]
`:""}#[test]
fn ${e.name}_boundary_${s.name}() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ${n});
    let client = ${n}Client::new(&env, &contract_id);
    // Boundary value for \`${s.name}\`: ${r.join(", ")}
    let _ = client.${e.name}(${i});
}`;return{id:A("test"),kind:"unit",name:`${e.name}_boundary_${s.name}`,functionName:e.name,description:`Drives \`${s.name}\` to its type boundary to probe for overflow/underflow panics in \`${e.name}\`.`,code:o,estimatedCoverageGain:1.1}}function $e(e,n){const s=`proptest! {
    #[test]
    fn ${e.functionName}_invariant_holds(seed in any::<i64>()) {
        // Invariant: ${e.description}
        // Expression: ${e.expression}
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ${n});
        let client = ${n}Client::new(&env, &contract_id);
        // TODO: derive concrete arguments for \`${e.functionName}\` from \`seed\`
        // and assert the invariant above holds for every generated input.
        let _ = (&client, seed);
    }
}`;return{id:A("test"),kind:"property",name:`${e.functionName}_invariant_holds`,functionName:e.functionName,description:e.description,code:s,estimatedCoverageGain:.9}}function Ne(e,n){const s=e.params.map(i=>{const a=L[i.kind];return a?`[${a.join(", ")}]`:`[${U(i)}]`}),r=`// Fuzz seed corpus for \`${e.name}\` — feed these values (and combinations
// thereof) through a fuzzing harness such as \`cargo fuzz\` or \`honggfuzz\`.
fn ${e.name}_fuzz_seeds() -> Vec<&'static str> {
    vec![${s.map(i=>`"${i.replace(/"/g,"'")}"`).join(", ")}]
}

fuzz_target!(|data: &[u8]| {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ${n});
    let client = ${n}Client::new(&env, &contract_id);
    // TODO: decode \`data\` into ${e.name}'s argument types and invoke the client,
    // asserting it never panics outside of documented error paths.
    let _ = (&client, data);
});`;return{id:A("test"),kind:"fuzz",name:`${e.name}_fuzz_seeds`,functionName:e.name,description:`Boundary-derived fuzz seed corpus for \`${e.name}\`, covering ${e.params.length} parameter(s).`,code:r,estimatedCoverageGain:.6}}function Ae(e,n){if(!e.functionName)return null;const s=`#[test]
fn ${e.functionName}_regression_${e.category.replace(/-/g,"_")}() {
    // Regression guard for static finding ${e.id} (${e.severity}):
    // ${e.message}
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ${n});
    let client = ${n}Client::new(&env, &contract_id);
    // TODO: reproduce the flagged condition and assert the fix holds
    // (e.g. that unauthorized callers are rejected, or overflow is checked).
    let _ = &client;
}`;return{id:A("test"),kind:"regression",name:`${e.functionName}_regression_${e.category}`,functionName:e.functionName,description:`Regression stub tracking static finding: ${e.message}`,code:s,estimatedCoverageGain:.4}}function Te(e,n,s){const r=[];for(const a of e.functions){r.push(ke(a,e.contractName));const o=Se(a,e.contractName);o&&r.push(o),r.push(Ne(a,e.contractName))}for(const a of s)r.push($e(a,e.contractName));for(const a of n)if(a.severity==="critical"||a.severity==="high"){const o=Ae(a,e.contractName);o&&r.push(o)}const i={unit:0,property:0,fuzz:0,regression:0};for(const a of r)i[a.kind]+=1;return{contractName:e.contractName,generatedAt:new Date().toISOString(),totalTestCases:r.length,byKind:i,testCases:r}}function ze(e,n){const s=e.functions.length,r=new Map;for(const h of n.testCases)r.set(h.functionName,(r.get(h.functionName)??0)+1);const i=e.functions.filter(h=>(r.get(h.name)??0)>0).length,a=e.functions.filter(h=>(r.get(h.name)??0)===0).map(h=>h.name),o=e.functions.reduce((h,p)=>h+Math.max(1,p.branchCount),0),d=e.functions.reduce((h,p)=>{const T=r.get(p.name)??0;if(T===0)return h;const M=Math.max(1,p.branchCount);return h+Math.min(M,T)},0),y=s===0?0:O(i/s*100),x=o===0?0:O(d/o*100),u=O(y*.35+x*.65);return{totalFunctions:s,coveredFunctions:i,totalBranches:o,coveredBranches:d,estimatedFunctionCoveragePct:y,estimatedBranchCoveragePct:x,estimatedPathCoveragePct:u,uncoveredFunctions:a}}function O(e){return Math.round(e*100)/100}let G=0;function Ee(e){return G+=1,`${e}-${G.toString(36)}`}function Re(e,n){return n.testCases.some(s=>s.functionName===e.name&&(s.kind==="property"||s.kind==="regression"||s.name.includes("boundary")))}function Ie(e,n){const s=[],r=Re(e,n);return e.hasUncheckedArithmetic&&s.push(z(e.name,"arithmetic-operator-flip",`Flip \`+\` to \`-\` (or vice versa) in ${e.name}`,r)),e.branchCount>0&&s.push(z(e.name,"comparison-boundary-flip",`Flip \`<\` to \`<=\` (or vice versa) in a conditional inside ${e.name}`,r)),e.hasAuthCheck&&s.push(z(e.name,"auth-check-negation",`Remove the \`require_auth\` call in ${e.name}`,n.testCases.some(i=>i.functionName===e.name&&i.kind==="regression"))),e.returnType&&s.push(z(e.name,"return-value-negation",`Negate/replace the return value of ${e.name}`,r)),s}function z(e,n,s,r){return{id:Ee("mutant"),functionName:e,operator:n,description:s,likelyKilled:r}}function Fe(e,n){const s=e.functions.flatMap(o=>Ie(o,n)),r=s.filter(o=>o.likelyKilled).length,i=s.length-r,a=s.length===0?0:Math.round(r/s.length*1e4)/100;return{totalMutants:s.length,likelyKilled:r,likelySurvived:i,estimatedMutationScorePct:a,mutants:s}}let V=0;function D(e){return V+=1,`${e}-${V.toString(36)}`}const Me='This report is produced by pattern-based static analysis over the parsed source, not symbolic execution, model checking, or a theorem prover. Statuses indicate what the heuristics found, not a mathematical proof of correctness — treat "pass" as "no contradicting pattern observed", not "verified sound".';function Oe(e,n){return n.filter(s=>s.functionName===e)}function De(e,n,s){const r=Oe(e.functionName,s);if(e.expression.includes("does not panic and result >= 0")){const o=r.find(y=>y.category==="arithmetic"),d=o?"fail":"needs-review";return{id:D("obligation"),functionName:e.functionName,property:e.description,category:"arithmetic",status:d,rationale:o?`Static analysis found unchecked arithmetic in \`${e.functionName}\` (${o.id}); overflow/underflow is not ruled out until \`checked_*\` guards are added and the generated boundary test passes.`:"No unchecked-arithmetic pattern observed, but this cannot be proven without executing the generated boundary tests against the compiled contract."}}if(e.expression.includes("fails require_auth")){const o=r.find(y=>y.category==="access-control"),d=o?"fail":"pass";return{id:D("obligation"),functionName:e.functionName,property:e.description,category:"access-control",status:d,rationale:o?`\`${e.functionName}\` mutates state without an observed \`require_auth\` guard (${o.id}); unauthorized callers are not statically excluded.`:`A \`.require_auth()\`/\`.require_auth_for_args()\` call was observed guarding \`${e.functionName}\`; the Soroban host rejects calls lacking a valid signature for that address.`}}const i=r.find(o=>o.category==="panic-safety"),a=i?"fail":n!=null&&n.hasUncheckedArithmetic?"needs-review":"pass";return{id:D("obligation"),functionName:e.functionName,property:e.description,category:"panic-safety",status:a,rationale:i?`\`${e.functionName}\` contains \`panic!\`/\`.unwrap()\`/\`.expect()\` (${i.id}); boundary inputs can abort the transaction instead of returning a typed error.`:n!=null&&n.hasUncheckedArithmetic?"No explicit panic call observed, but unchecked arithmetic can still trap on boundary inputs — run the generated boundary test to confirm.":"No panic-prone calls or unchecked arithmetic observed for boundary-relevant parameters."}}function Pe(e,n,s){const r=new Map(e.functions.map(a=>[a.name,a])),i=s.map(a=>De(a,r.get(a.functionName),n));return{methodology:"heuristic-static-analysis",disclaimer:Me,obligations:i,passCount:i.filter(a=>a.status==="pass").length,failCount:i.filter(a=>a.status==="fail").length,needsReviewCount:i.filter(a=>a.status==="needs-review").length}}function Be(e,n="contracts/"+Le(e)){return`name: ${e} contract tests

on:
  push:
    paths:
      - '${n}/**'
  pull_request:
    paths:
      - '${n}/**'

jobs:
  test:
    name: Build, test, and verify
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ${n}
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: wasm32-unknown-unknown
          override: true

      - name: Install Soroban CLI
        run: cargo install --locked soroban-cli --version ^21

      - name: Build contract (wasm32 target)
        run: soroban contract build

      - name: Run unit + property-based tests
        run: cargo test --workspace

      - name: Run mutation testing (advisory)
        continue-on-error: true
        run: |
          cargo install --locked cargo-mutants
          cargo mutants --no-shuffle --timeout-multiplier 2 -- --workspace

      - name: Upload mutation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mutants-report
          path: ${n}/mutants.out
          if-no-files-found: ignore
`}function Le(e){return e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")}const Y=2e5,Ue=/^[A-Za-z_][A-Za-z0-9_]{0,127}$/;class S extends Error{constructor(n){super(n.message),this.name="ContractTestingError",this.code=n.code,this.retryable=n.retryable,this.requestId=n.requestId}}function qe(){return typeof crypto<"u"&&"randomUUID"in crypto?crypto.randomUUID():`contract-testing-${Date.now()}-${Math.random().toString(36).slice(2)}`}function We(e,n,s,r="live"){const i=Date.now(),a=be(e);n&&(te(n,s),a.contractName=n);const o=Ce(a),d=_e(a),y=Te(a,o,d),x=ze(a,y),u=Fe(a,y),h=Pe(a,o,d),p=Be(a.contractName);return{requestId:s,generatedAt:new Date().toISOString(),state:r,contract:a,findings:o,invariants:d,testSuite:y,coverage:x,mutation:u,verification:h,ciWorkflowYaml:p,durationMs:Date.now()-i}}function te(e,n){if(e&&!Ue.test(e))throw new S({code:"invalid-contract-name",message:"Contract name must be a valid Rust identifier (letters, numbers, and underscores only).",retryable:!1,requestId:n})}function Ke(e,n){if(!e||e.trim().length===0)throw new S({code:"empty-source",message:"Paste or upload a Soroban contract source file first.",retryable:!1,requestId:n});if(e.length>Y)throw new S({code:"source-too-large",message:`Contract source exceeds the ${Y.toLocaleString()} character analysis limit.`,retryable:!1,requestId:n})}async function Ge(e,n={}){const s=qe();if(Ke(e,s),te(n.contractName,s),e.trim().length>0&&(e.match(/pub\s+fn\s+[a-zA-Z_]/g)??[]).length===0)throw new S({code:"no-functions-found",message:"No `pub fn` entry points were found inside a `#[contractimpl]` block.",retryable:!1,requestId:s});return{data:We(e,n.contractName,s,"simulation"),requestId:s}}const Ve=`#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

#[contracttype]
pub enum DataKey {
    Balance(Address),
    Admin,
}

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    pub fn initialize(env: Env, admin: Address, decimal: u32, name: String) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        let _ = (decimal, name);
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let key = DataKey::Balance(to.clone());
        let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        let new_balance = balance + amount;
        env.storage().persistent().set(&key, &new_balance);
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let from_key = DataKey::Balance(from.clone());
        let from_balance: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
        if from_balance < amount {
            panic!("insufficient balance");
        }
        let new_from_balance = from_balance - amount;
        env.storage().persistent().set(&from_key, &new_from_balance);

        let to_key = DataKey::Balance(to.clone());
        let to_balance: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);
        let new_to_balance = to_balance + amount;
        env.storage().persistent().set(&to_key, &new_to_balance);
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        let key = DataKey::Balance(id);
        env.storage().persistent().get(&key).unwrap_or(0)
    }
}
`,Ye=`#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Symbol, symbol_short};

const COUNTER: Symbol = symbol_short!("COUNTER");

#[contract]
pub struct CounterContract;

#[contractimpl]
impl CounterContract {
    pub fn increment(env: Env) -> u32 {
        let mut count: u32 = env.storage().instance().get(&COUNTER).unwrap_or(0);
        count += 1;
        env.storage().instance().set(&COUNTER, &count);
        count
    }

    pub fn reset(env: Env) {
        env.storage().instance().set(&COUNTER, &0u32);
    }

    pub fn get(env: Env) -> u32 {
        env.storage().instance().get(&COUNTER).unwrap_or(0)
    }
}
`,Ze=`#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
pub struct Deal {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub released: bool,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn open(env: Env, buyer: Address, seller: Address, amount: i128) {
        buyer.require_auth();
        let deal = Deal { buyer, seller, amount, released: false };
        env.storage().persistent().set(&seller, &deal);
    }

    pub fn release(env: Env, seller: Address, target: Address) {
        let mut deal: Deal = env.storage().persistent().get(&seller).unwrap();
        deal.released = true;
        env.storage().persistent().set(&seller, &deal);
        env.invoke_contract::<()>(&target, &symbol_placeholder(), soroban_sdk::vec![&env]);
    }

    pub fn cancel(env: Env, seller: Address) {
        env.storage().persistent().remove(&seller);
    }
}

fn symbol_placeholder() -> soroban_sdk::Symbol {
    unimplemented!()
}
`,ne=[{id:"token",label:"Fungible token",description:"Mint/transfer/balance token contract — includes an admin-guarded mint and a checked transfer.",source:Ve},{id:"counter",label:"Simple counter",description:"Minimal storage-backed counter — good first contract to see the pipeline end to end.",source:Ye},{id:"escrow",label:"Escrow (deliberately flawed)",description:"Escrow release is missing require_auth and calls out to another contract after writing state — intentionally triggers access-control and reentrancy-shaped findings.",source:Ze}];function Xe(e){return ne.find(n=>n.id===e)}const se="stellar:contract-testing:history",He=10,Z={unit:"Unit tests",property:"Property-based tests",fuzz:"Fuzz seed corpora",regression:"Regression tests"};function Je(){try{const e=localStorage.getItem(se),n=e?JSON.parse(e):[];return Array.isArray(n)?n:[]}catch{return[]}}function Qe(e){try{localStorage.setItem(se,JSON.stringify(e))}catch{}}function et(e){return{requestId:e.requestId,contractName:e.contract.contractName,generatedAt:e.generatedAt,findingsCount:e.findings.length,criticalFindingsCount:e.findings.filter(n=>n.severity==="critical").length,estimatedPathCoveragePct:e.coverage.estimatedPathCoveragePct,estimatedMutationScorePct:e.mutation.estimatedMutationScorePct}}function P(e,n,s){const r=URL.createObjectURL(new Blob([n],{type:s})),i=document.createElement("a");i.href=r,i.download=e,i.click(),URL.revokeObjectURL(r)}function tt(){const[e,n]=m.useState(""),[s,r]=m.useState(""),[i,a]=m.useState(null),[o,d]=m.useState(!1),[y,x]=m.useState(null),[u,h]=m.useState(Je),p=m.useRef(null);m.useEffect(()=>()=>{var v;return(v=p.current)==null?void 0:v.abort()},[]);const T=m.useCallback(async()=>{var j;(j=p.current)==null||j.abort();const v=new AbortController;p.current=v,d(!0),x(null);try{const C=await Ge(e,{signal:v.signal,contractName:s.trim()||void 0});if(v.signal.aborted||p.current!==v)return;a(C.data),h($=>{const _=[et(C.data),...$].slice(0,He);return Qe(_),_})}catch(C){!v.signal.aborted&&p.current===v&&x(C instanceof S?C:new S({code:"unavailable",message:"Unable to analyze contract.",retryable:!0}))}finally{p.current===v&&(p.current=null,d(!1))}},[e,s]),M=m.useCallback(v=>{const j=Xe(v);j&&(n(j.source),r(""),x(null))},[]),ie=m.useCallback(async v=>{const j=await v.text();n(j),x(null)},[]),oe=m.useCallback(()=>{a(null),x(null)},[]),ce=m.useCallback(()=>{if(!i)return;const v=Object.keys(Z).map(C=>{const $=i.testSuite.testCases.filter(_=>_.kind===C);return $.length===0?"":`// ---- ${Z[C]} (${$.length}) ----

${$.map(_=>_.code).join(`

`)}`}).filter(Boolean).join(`

`),j=`// Generated by Stellar Dev Dashboard — Contract Testing & Verification
// Contract: ${i.contract.contractName}
// Generated at: ${i.testSuite.generatedAt}
// NOTE: fill in the TODOs before relying on these as CI gates.

`;P(`${i.contract.contractName}_generated_tests.rs`,j+v,"text/x-rust")},[i]),le=m.useCallback(()=>{i&&P(`${i.contract.contractName.toLowerCase()}-contract-tests.yml`,i.ciWorkflowYaml,"text/yaml")},[i]),de=m.useCallback(()=>{i&&P(`${i.contract.contractName}_analysis_report.json`,JSON.stringify(i,null,2),"application/json")},[i]);return{source:e,setSource:n,contractName:s,setContractName:r,result:i,loading:o,error:y,history:u,samples:ne,runAnalysis:T,loadSample:M,loadFromFile:ie,reset:oe,downloadTestSuite:ce,downloadCiWorkflow:le,downloadReport:de}}const l={border:"1px solid var(--border)",borderRadius:"var(--radius-md)",background:"var(--bg-elevated)",padding:"16px"},nt={display:"flex",flexDirection:"column",gap:"20px",padding:"var(--content-padding, 24px)",color:"var(--text-primary)"},re={display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:"12px"},c={color:"var(--text-secondary)",fontSize:"13px"},I={overflowX:"auto",border:"1px solid var(--border)",borderRadius:"var(--radius-md)"},F={width:"100%",borderCollapse:"collapse",fontSize:"13px"},g={textAlign:"left",padding:"10px 12px",borderBottom:"1px solid var(--border)",color:"var(--text-secondary)",fontSize:"11px",textTransform:"uppercase",letterSpacing:"0.04em"},f={padding:"10px 12px",borderBottom:"1px solid var(--border)",verticalAlign:"top"},w={border:"1px solid var(--border-bright)",background:"var(--bg-card)",color:"var(--text-primary)",borderRadius:"var(--radius-sm)",padding:"8px 14px",fontSize:"13px",cursor:"pointer"},k={...w,background:"var(--cyan)",borderColor:"var(--cyan)",color:"var(--bg-base)",fontWeight:600},ae={background:"var(--bg-base)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",padding:"12px",fontFamily:"var(--font-mono, monospace)",fontSize:"12px",overflowX:"auto",whiteSpace:"pre"},st={critical:"var(--red)",high:"var(--red)",medium:"var(--amber)",low:"var(--cyan)",info:"var(--text-muted)"};function rt(e){return st[e]}const at={pass:"var(--green)",fail:"var(--red)","needs-review":"var(--amber)"};function E(e){return at[e]}function N(e){return{display:"inline-block",padding:"2px 8px",borderRadius:"999px",fontSize:"11px",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.03em",color:e,border:`1px solid ${e}`,background:"transparent"}}function it({findings:e}){if(e.length===0)return t.jsxs("section",{style:l,children:[t.jsx("h2",{children:"Static findings"}),t.jsx("p",{style:c,children:"No heuristic findings were raised for this contract. This does not guarantee correctness — see the Formal Verification tab for what was, and wasn't, checked."})]});const n=[...e].sort((s,r)=>X(r.severity)-X(s.severity));return t.jsxs("section",{style:{display:"flex",flexDirection:"column",gap:"12px"},children:[t.jsxs("div",{style:l,children:[t.jsxs("h2",{children:["Static findings (",e.length,")"]}),t.jsx("p",{style:c,children:"Pattern-based static analysis results — access control, arithmetic, panic-safety, reentrancy shape, and storage-growth heuristics. Not a substitute for manual audit."})]}),t.jsx("div",{style:I,children:t.jsxs("table",{style:F,children:[t.jsx("thead",{children:t.jsxs("tr",{children:[t.jsx("th",{style:g,children:"Severity"}),t.jsx("th",{style:g,children:"Category"}),t.jsx("th",{style:g,children:"Function"}),t.jsx("th",{style:g,children:"Finding"}),t.jsx("th",{style:g,children:"Recommendation"})]})}),t.jsx("tbody",{children:n.map(s=>t.jsxs("tr",{children:[t.jsx("td",{style:f,children:t.jsx("span",{style:N(rt(s.severity)),children:s.severity})}),t.jsx("td",{style:f,children:s.category}),t.jsxs("td",{style:f,children:[t.jsx("code",{children:s.functionName??"—"}),s.line?t.jsxs("div",{style:c,children:["line ",s.line]}):null]}),t.jsx("td",{style:f,children:s.message}),t.jsx("td",{style:{...f,...c},children:s.recommendation})]},s.id))})]})})]})}function X(e){return{critical:4,high:3,medium:2,low:1,info:0}[e]}const B={unit:"Unit",property:"Property-based",fuzz:"Fuzz seeds",regression:"Regression"},H=["unit","property","fuzz","regression"];function ot({suite:e,onDownload:n}){const[s,r]=m.useState("all"),i=e.testCases.filter(a=>s==="all"||a.kind===s);return t.jsxs("section",{style:{display:"flex",flexDirection:"column",gap:"12px"},children:[t.jsxs("div",{style:l,children:[t.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"},children:[t.jsxs("div",{children:[t.jsxs("h2",{children:["Generated test suite (",e.totalTestCases,")"]}),t.jsx("p",{style:c,children:H.map(a=>`${e.byKind[a]} ${B[a].toLowerCase()}`).join(" · ")})]}),t.jsx("button",{style:k,onClick:n,children:"Download .rs"})]}),t.jsxs("div",{role:"tablist","aria-label":"Filter generated tests by kind",style:{display:"flex",gap:"8px",marginTop:"12px",flexWrap:"wrap"},children:[t.jsxs("button",{role:"tab","aria-selected":s==="all",style:s==="all"?k:w,onClick:()=>r("all"),children:["All (",e.totalTestCases,")"]}),H.map(a=>t.jsxs("button",{role:"tab","aria-selected":s===a,style:s===a?k:w,onClick:()=>r(a),children:[B[a]," (",e.byKind[a],")"]},a))]})]}),t.jsxs("div",{style:re,children:[i.map(a=>t.jsxs("div",{style:l,children:[t.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:"8px"},children:[t.jsx("strong",{children:a.name}),t.jsx("span",{style:c,children:B[a.kind]})]}),t.jsx("p",{style:c,children:a.description}),t.jsx("pre",{style:ae,children:a.code})]},a.id)),i.length===0&&t.jsx("p",{style:c,children:"No generated tests match this filter."})]})]})}function R({label:e,value:n,hint:s}){return t.jsxs("div",{style:l,children:[t.jsx("div",{style:c,children:e}),t.jsx("strong",{style:{fontSize:"28px"},children:n}),s&&t.jsx("div",{style:c,children:s})]})}function ct({coverage:e,mutation:n}){return t.jsxs("section",{style:{display:"flex",flexDirection:"column",gap:"12px"},children:[t.jsxs("div",{style:re,children:[t.jsx(R,{label:"Estimated path coverage",value:`${e.estimatedPathCoveragePct}%`,hint:"Static estimate, not instrumented coverage"}),t.jsx(R,{label:"Function coverage",value:`${e.coveredFunctions}/${e.totalFunctions}`}),t.jsx(R,{label:"Branch coverage",value:`${e.estimatedBranchCoveragePct}%`,hint:`${e.coveredBranches}/${e.totalBranches} branches`}),t.jsx(R,{label:"Estimated mutation score",value:`${n.estimatedMutationScorePct}%`,hint:`${n.likelyKilled}/${n.totalMutants} mutants likely killed`})]}),e.uncoveredFunctions.length>0&&t.jsxs("div",{style:l,children:[t.jsx("h2",{children:"Uncovered functions"}),t.jsx("p",{style:c,children:"No generated test case targets these — treat them as the next place to add coverage."}),t.jsx("ul",{children:e.uncoveredFunctions.map(s=>t.jsx("li",{children:t.jsx("code",{children:s})},s))})]}),t.jsxs("div",{style:l,children:[t.jsx("h2",{children:"Mutants"}),t.jsxs("p",{style:c,children:["Estimated from generated-test assertion strength, not an executed ",t.jsx("code",{children:"cargo-mutants"})," run — the generated CI workflow runs the real thing."]}),t.jsx("div",{style:I,children:t.jsxs("table",{style:F,children:[t.jsx("thead",{children:t.jsxs("tr",{children:[t.jsx("th",{style:g,children:"Function"}),t.jsx("th",{style:g,children:"Operator"}),t.jsx("th",{style:g,children:"Description"}),t.jsx("th",{style:g,children:"Likely killed?"})]})}),t.jsx("tbody",{children:n.mutants.map(s=>t.jsxs("tr",{children:[t.jsx("td",{style:f,children:t.jsx("code",{children:s.functionName})}),t.jsx("td",{style:f,children:s.operator}),t.jsx("td",{style:f,children:s.description}),t.jsx("td",{style:{...f,color:s.likelyKilled?"var(--green)":"var(--red)"},children:s.likelyKilled?"Likely killed":"Likely survives"})]},s.id))})]})})]})]})}function lt({verification:e}){return t.jsxs("section",{style:{display:"flex",flexDirection:"column",gap:"12px"},children:[t.jsxs("div",{style:l,children:[t.jsx("h2",{children:"Formal verification report"}),t.jsx("p",{style:c,children:e.disclaimer}),t.jsxs("div",{style:{display:"flex",gap:"16px",marginTop:"8px",flexWrap:"wrap"},children:[t.jsxs("span",{style:N(E("pass")),children:[e.passCount," pass"]}),t.jsxs("span",{style:N(E("fail")),children:[e.failCount," fail"]}),t.jsxs("span",{style:N(E("needs-review")),children:[e.needsReviewCount," needs review"]})]})]}),e.obligations.length===0?t.jsx("div",{style:l,children:t.jsx("p",{style:c,children:"No invariants were derived for this contract to check obligations against."})}):t.jsx("div",{style:I,children:t.jsxs("table",{style:F,children:[t.jsx("thead",{children:t.jsxs("tr",{children:[t.jsx("th",{style:g,children:"Status"}),t.jsx("th",{style:g,children:"Function"}),t.jsx("th",{style:g,children:"Property"}),t.jsx("th",{style:g,children:"Rationale"})]})}),t.jsx("tbody",{children:e.obligations.map(n=>t.jsxs("tr",{children:[t.jsx("td",{style:f,children:t.jsx("span",{style:N(E(n.status)),children:n.status})}),t.jsx("td",{style:f,children:t.jsx("code",{children:n.functionName})}),t.jsx("td",{style:f,children:n.property}),t.jsx("td",{style:{...f,...c},children:n.rationale})]},n.id))})]})})]})}function dt({workflowYaml:e,onDownload:n,onCopy:s}){return t.jsxs("section",{style:{display:"flex",flexDirection:"column",gap:"12px"},children:[t.jsx("div",{style:l,children:t.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"},children:[t.jsxs("div",{children:[t.jsx("h2",{children:"CI/CD integration"}),t.jsxs("p",{style:c,children:["A ready-to-commit GitHub Actions workflow that builds the contract, runs the generated test suite, and runs ",t.jsx("code",{children:"cargo-mutants"})," as an advisory (non-blocking) step."]})]}),t.jsxs("div",{style:{display:"flex",gap:"8px"},children:[t.jsx("button",{style:w,onClick:s,children:"Copy YAML"}),t.jsx("button",{style:k,onClick:n,children:"Download workflow"})]})]})}),t.jsx("pre",{style:ae,children:e})]})}function ut({history:e}){return e.length===0?t.jsxs("section",{style:l,children:[t.jsx("h2",{children:"Run history"}),t.jsx("p",{style:c,children:"No prior analyses yet in this browser. History is kept locally (last 10 runs)."})]}):t.jsxs("section",{style:{display:"flex",flexDirection:"column",gap:"12px"},children:[t.jsxs("div",{style:l,children:[t.jsx("h2",{children:"Run history"}),t.jsx("p",{style:c,children:"Stored locally in this browser only — nothing here is sent anywhere."})]}),t.jsx("div",{style:I,children:t.jsxs("table",{style:F,children:[t.jsx("thead",{children:t.jsxs("tr",{children:[t.jsx("th",{style:g,children:"When"}),t.jsx("th",{style:g,children:"Contract"}),t.jsx("th",{style:g,children:"Findings"}),t.jsx("th",{style:g,children:"Path coverage"}),t.jsx("th",{style:g,children:"Mutation score"})]})}),t.jsx("tbody",{children:e.map(n=>t.jsxs("tr",{children:[t.jsx("td",{style:f,children:new Date(n.generatedAt).toLocaleString()}),t.jsx("td",{style:f,children:t.jsx("code",{children:n.contractName})}),t.jsxs("td",{style:f,children:[n.findingsCount,n.criticalFindingsCount>0&&t.jsxs("span",{style:{color:"var(--red)"},children:[" (",n.criticalFindingsCount," critical)"]})]}),t.jsxs("td",{style:f,children:[n.estimatedPathCoveragePct,"%"]}),t.jsxs("td",{style:f,children:[n.estimatedMutationScorePct,"%"]})]},n.requestId))})]})})]})}const ht=["overview","findings","tests","coverage","verification","ci","history"],pt={overview:"Overview",findings:"Findings",tests:"Generated Tests",coverage:"Coverage & Mutation",verification:"Formal Verification",ci:"CI Integration",history:"History"};function mt({source:e,setSource:n,contractName:s,setContractName:r,onAnalyze:i,onFile:a,onSample:o,samples:d,loading:y}){const x=m.useRef(null);return t.jsxs("div",{style:l,children:[t.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:"8px"},children:[t.jsx("h2",{style:{margin:0},children:"Contract source"}),t.jsx("div",{style:{display:"flex",gap:"8px",flexWrap:"wrap"},children:d.map(u=>t.jsx("button",{style:w,onClick:()=>o(u.id),title:u.description,children:u.label},u.id))})]}),t.jsx("label",{htmlFor:"contract-testing-name",style:{...c,display:"block",marginTop:"12px"},children:"Contract name (optional override)"}),t.jsx("input",{id:"contract-testing-name",type:"text",value:s,onChange:u=>r(u.target.value),placeholder:"Detected automatically from #[contract]",style:{width:"100%",marginTop:"4px",marginBottom:"8px",padding:"8px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--bg-card)",color:"var(--text-primary)"}}),t.jsx("label",{htmlFor:"contract-testing-source",style:c,children:"Paste Soroban Rust source, or upload a .rs file"}),t.jsx("textarea",{id:"contract-testing-source",value:e,onChange:u=>n(u.target.value),rows:12,placeholder:`#[contract]
pub struct MyContract;

#[contractimpl]
impl MyContract {
    pub fn hello(env: Env) -> Symbol { ... }
}`,style:{width:"100%",marginTop:"4px",padding:"10px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--bg-card)",color:"var(--text-primary)",fontFamily:"var(--font-mono, monospace)",fontSize:"12px",resize:"vertical"}}),t.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"12px",flexWrap:"wrap",gap:"8px"},children:[t.jsxs("div",{children:[t.jsx("input",{ref:x,type:"file",accept:".rs,text/x-rust,text/plain",style:{display:"none"},onChange:u=>{var p;const h=(p=u.target.files)==null?void 0:p[0];h&&a(h),u.target.value=""}}),t.jsx("button",{style:w,onClick:()=>{var u;return(u=x.current)==null?void 0:u.click()},children:"Upload .rs file"})]}),t.jsx("button",{style:k,onClick:i,disabled:y,children:y?"Analyzing…":"Analyze contract"})]})]})}function xt(){const e=tt(),[n,s]=m.useState("overview"),r=m.useCallback(()=>{s("overview"),e.runAnalysis()},[e]),i=m.useCallback(()=>{var a;e.result&&((a=navigator.clipboard)==null||a.writeText(e.result.ciWorkflowYaml))},[e.result]);return t.jsxs("main",{style:nt,children:[t.jsxs("header",{children:[t.jsx("div",{style:c,children:"SOROBAN CONTRACT TOOLING"}),t.jsx("h1",{style:{margin:"4px 0"},children:"Contract Testing & Verification"}),t.jsx("p",{style:c,children:"Paste a Soroban contract to get a generated test suite, static/security findings, coverage and mutation estimates, a heuristic formal-verification report, and a downloadable CI workflow."})]}),t.jsx(mt,{source:e.source,setSource:e.setSource,contractName:e.contractName,setContractName:e.setContractName,onAnalyze:r,onFile:e.loadFromFile,onSample:e.loadSample,samples:e.samples,loading:e.loading}),e.error&&t.jsxs("div",{style:{...l,borderColor:"var(--red)"},role:"alert",children:[t.jsx("strong",{style:{color:"var(--red)"},children:"Analysis failed"}),t.jsx("p",{children:e.error.message}),e.error.retryable&&t.jsx("button",{style:w,onClick:r,children:"Retry"})]}),e.loading&&!e.result&&t.jsx("div",{style:l,"aria-busy":"true",children:t.jsx("p",{children:"Parsing contract, running static analysis, and generating tests…"})}),!e.loading&&!e.error&&!e.result&&t.jsx("div",{style:l,children:t.jsxs("p",{style:c,children:["No analysis yet. Paste a contract above, load a sample, or upload a .rs file, then click"," ",t.jsx("strong",{children:"Analyze contract"}),"."]})}),e.result&&t.jsxs(t.Fragment,{children:[e.result.state!=="live"&&t.jsxs("div",{style:{...l,borderColor:"var(--amber)"},role:"status",children:[t.jsxs("strong",{style:{color:"var(--amber)"},children:[e.result.state==="degraded"?"DEGRADED":"LOCAL ANALYSIS",":"]})," ",e.result.state==="degraded"?"The remote analyzer is unavailable, so results were generated locally from your actual source.":"Results were generated in this browser and no contract source was uploaded."]}),t.jsxs("nav",{"aria-label":"Contract analysis views",style:{display:"flex",gap:"8px",flexWrap:"wrap"},children:[ht.map(a=>t.jsxs("button",{"aria-current":n===a?"page":void 0,style:n===a?k:w,onClick:()=>s(a),children:[pt[a],a==="findings"&&e.result.findings.length?` (${e.result.findings.length})`:""]},a)),t.jsx("button",{style:w,onClick:e.downloadReport,children:"Export JSON report"})]}),n==="overview"&&t.jsx(yt,{result:e.result}),n==="findings"&&t.jsx(it,{findings:e.result.findings}),n==="tests"&&t.jsx(ot,{suite:e.result.testSuite,onDownload:e.downloadTestSuite}),n==="coverage"&&t.jsx(ct,{coverage:e.result.coverage,mutation:e.result.mutation}),n==="verification"&&t.jsx(lt,{verification:e.result.verification}),n==="ci"&&t.jsx(dt,{workflowYaml:e.result.ciWorkflowYaml,onDownload:e.downloadCiWorkflow,onCopy:i}),n==="history"&&t.jsx(ut,{history:e.history}),t.jsxs("footer",{style:c,children:["Generated ",new Date(e.result.generatedAt).toLocaleString()," · Request ",e.result.requestId.slice(0,12)," ·"," ",e.result.durationMs,"ms"]})]})]})}function yt({result:e}){const n=e.findings.filter(r=>r.severity==="critical").length,s=e.findings.filter(r=>r.severity==="high").length;return t.jsxs("section",{style:{display:"flex",flexDirection:"column",gap:"12px"},children:[t.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:"12px"},children:[t.jsxs("div",{style:l,children:[t.jsx("div",{style:c,children:"Contract"}),t.jsx("strong",{style:{fontSize:"20px"},children:e.contract.contractName}),t.jsxs("div",{style:c,children:[e.contract.functions.length," functions · ",e.contract.lineCount," lines"]})]}),t.jsxs("div",{style:l,children:[t.jsx("div",{style:c,children:"Findings"}),t.jsx("strong",{style:{fontSize:"28px",color:n?"var(--red)":s?"var(--amber)":"var(--text-primary)"},children:e.findings.length}),t.jsxs("div",{style:c,children:[n," critical · ",s," high"]})]}),t.jsxs("div",{style:l,children:[t.jsx("div",{style:c,children:"Estimated path coverage"}),t.jsxs("strong",{style:{fontSize:"28px"},children:[e.coverage.estimatedPathCoveragePct,"%"]})]}),t.jsxs("div",{style:l,children:[t.jsx("div",{style:c,children:"Estimated mutation score"}),t.jsxs("strong",{style:{fontSize:"28px"},children:[e.mutation.estimatedMutationScorePct,"%"]})]}),t.jsxs("div",{style:l,children:[t.jsx("div",{style:c,children:"Generated tests"}),t.jsx("strong",{style:{fontSize:"28px"},children:e.testSuite.totalTestCases})]}),t.jsxs("div",{style:l,children:[t.jsx("div",{style:c,children:"Verification obligations"}),t.jsx("strong",{style:{fontSize:"28px"},children:e.verification.obligations.length}),t.jsxs("div",{style:c,children:[e.verification.passCount," pass · ",e.verification.failCount," fail · ",e.verification.needsReviewCount," review"]})]})]}),t.jsxs("div",{style:l,children:[t.jsx("h2",{children:"Detected functions"}),t.jsx("div",{style:{display:"flex",flexDirection:"column",gap:"6px"},children:e.contract.functions.map(r=>t.jsxs("div",{style:{display:"flex",justifyContent:"space-between",borderBottom:"1px solid var(--border)",paddingBottom:"4px"},children:[t.jsxs("code",{children:[r.name,"(",r.params.map(i=>`${i.name}: ${i.type}`).join(", "),")",r.returnType?` -> ${r.returnType}`:""]}),t.jsxs("span",{style:c,children:[r.mutatesState?"mutates state":"read-only"," · ",r.hasAuthCheck?"auth-checked":"no auth check"]})]},r.name))})]})]})}export{xt as default};
//# sourceMappingURL=ContractTestingDashboard-DnNtNeOH.js.map
