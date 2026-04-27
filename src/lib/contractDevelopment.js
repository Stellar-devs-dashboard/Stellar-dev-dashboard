const CONTRACT_TEMPLATES = [
  {
    id: 'token',
    name: 'Fungible Token',
    description: 'ERC20-style Soroban token with mint and transfer flows.',
    tags: ['token', 'payments', 'utility'],
    entrypoint: 'transfer',
    source: `#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Address, Symbol};

#[contract]
pub struct Token;

#[contractimpl]
impl Token {
    pub fn initialize(_env: Env, _admin: Address, _name: Symbol, _symbol: Symbol, _decimals: u32) {
        // TODO: initialize token metadata
    }

    pub fn mint(_env: Env, _to: Address, _amount: i128) {
        // TODO: enforce admin auth and increase balance
    }

    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {
        // TODO: check auth and move balances
    }
}`,
  },
  {
    id: 'escrow',
    name: 'Milestone Escrow',
    description: 'Release funds on milestone confirmations with dispute timeout.',
    tags: ['escrow', 'marketplace', 'defi'],
    entrypoint: 'release',
    source: `#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Address, BytesN};

#[contract]
pub struct MilestoneEscrow;

#[contractimpl]
impl MilestoneEscrow {
    pub fn initialize(_env: Env, _payer: Address, _payee: Address, _arbiter: Address, _id: BytesN<32>) {
        // TODO: store escrow participants and status
    }

    pub fn fund(_env: Env, _amount: i128) {
        // TODO: accept escrow funding
    }

    pub fn approve_milestone(_env: Env, _milestone_id: u32) {
        // TODO: approve specific milestone
    }

    pub fn release(_env: Env) {
        // TODO: transfer escrowed amount to payee
    }
}`,
  },
  {
    id: 'oracle',
    name: 'Price Oracle',
    description: 'On-chain oracle feed with signer set and staleness checks.',
    tags: ['oracle', 'defi', 'pricing'],
    entrypoint: 'latest_price',
    source: `#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Address, Vec};

#[contract]
pub struct PriceOracle;

#[contractimpl]
impl PriceOracle {
    pub fn initialize(_env: Env, _admin: Address, _signers: Vec<Address>) {
        // TODO: set signer quorum
    }

    pub fn submit_price(_env: Env, _pair: u32, _price: i128, _timestamp: u64) {
        // TODO: require signer auth and store latest price
    }

    pub fn latest_price(_env: Env, _pair: u32) -> i128 {
        // TODO: load and return cached price
        0
    }
}`,
  },
]

function randomId(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`
}

export function getContractTemplates() {
  return CONTRACT_TEMPLATES
}

export function getContractTemplateById(templateId) {
  return CONTRACT_TEMPLATES.find((template) => template.id === templateId) || null
}

export function buildContractWorkspace(templateId, options = {}) {
  const template = getContractTemplateById(templateId)
  if (!template) throw new Error('Template not found')

  const contractName = (options.contractName || template.name).replace(/\s+/g, '')
  const packageName = contractName.toLowerCase()

  const tests = `use soroban_sdk::{Env, Address};

#[test]
fn test_${template.entrypoint}_flow() {
    let env = Env::default();
    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);

    // TODO: instantiate contract and seed state
    assert!(user_a != user_b);
}`

  return {
    ...template,
    workspaceId: randomId('workspace'),
    contractName,
    packageName,
    source: template.source,
    tests,
    deployCommand: `soroban contract deploy --wasm target/wasm32-unknown-unknown/release/${packageName}.wasm --source-account <SOURCE> --network <NETWORK_ALIAS>`,
  }
}

export function simulateSorobanTests(sourceCode, testCode, settings = {}) {
  const issues = []

  if (!sourceCode || sourceCode.length < 80) {
    issues.push('Source code is incomplete.')
  }

  if (!/#[\s]*contractimpl/.test(sourceCode)) {
    issues.push('Missing #[contractimpl] block.')
  }

  if (!/fn\s+[a-zA-Z0-9_]+\s*\(/.test(sourceCode)) {
    issues.push('No callable contract function found.')
  }

  if (!testCode || !/#[\s]*test/.test(testCode)) {
    issues.push('No #[test] function found.')
  }

  const lintHints = []
  if (!/panic!/.test(sourceCode)) {
    lintHints.push('No explicit panic path found. Consider adding guarded failure tests.')
  }
  if (!/Address/.test(sourceCode)) {
    lintHints.push('Contract does not currently handle account authorization inputs.')
  }

  const passed = issues.length === 0

  return {
    passed,
    durationMs: 450 + Math.floor(Math.random() * 500),
    executed: passed ? 3 : 1,
    failed: passed ? 0 : 1,
    issues,
    lintHints,
    profile: settings.profile || 'testnet-debug',
  }
}

export function generateDeploymentPlan(config = {}) {
  const network = config.network || 'testnet'
  const sourceAccount = config.sourceAccount || '<SOURCE_ACCOUNT>'
  const wasmPath = config.wasmPath || 'target/wasm32-unknown-unknown/release/contract.wasm'
  const contractSalt = config.contractSalt || randomId('salt')

  const command = [
    'soroban',
    'contract',
    'deploy',
    `--wasm ${wasmPath}`,
    `--source-account ${sourceAccount}`,
    `--network ${network}`,
    `--salt ${contractSalt}`,
  ].join(' ')

  return {
    network,
    sourceAccount,
    wasmPath,
    contractSalt,
    command,
    checklist: [
      'Build contract artifact with `cargo build --target wasm32-unknown-unknown --release`.',
      'Run unit tests and snapshot tests before deployment.',
      'Verify source account has enough XLM for fees.',
      'Record deployed contract ID and ABI in dashboard metadata.',
    ],
  }
}
