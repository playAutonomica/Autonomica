import { ethers } from "ethers";

/**
 * The actual work. Tasks are machine-verifiable toy workloads: the poster
 * publishes a deterministic spec, the agent computes the answer (on rented
 * compute), and the poster re-derives the answer to verify the submitted
 * hash. Rejections in the demo are REAL failed verification, not theater -
 * an agent with skill < 1.0 sometimes computes garbage and gets slashed
 * for it.
 *
 * Spec grammar: "KIND:arg1,arg2"
 *   PRIME_SUM:n          sum of the first n primes
 *   SHA_CHAIN:seed,k     keccak256 applied k times to the seed
 *   MONTE_PI:samples,seed  deterministic Monte-Carlo estimate of pi (4dp)
 *   MATMUL_TRACE:seed,n  trace of A^2 for a seeded n x n integer matrix
 *   MEME:seed            deterministic meme caption (creative "work")
 */

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function primeSum(n: number): bigint {
  const limit = Math.max(1000, Math.floor(n * (Math.log(n + 1) + Math.log(Math.log(n + 3))) * 1.3) + 100);
  const sieve = new Uint8Array(limit + 1);
  let count = 0;
  let sum = 0n;
  for (let i = 2; i <= limit && count < n; i++) {
    if (!sieve[i]) {
      count++;
      sum += BigInt(i);
      for (let j = i * i; j <= limit; j += i) sieve[j] = 1;
    }
  }
  return sum;
}

function shaChain(seed: string, k: number): string {
  let h = ethers.keccak256(ethers.toUtf8Bytes(seed));
  for (let i = 1; i < k; i++) h = ethers.keccak256(h);
  return h;
}

function montePi(samples: number, seed: number): string {
  const rnd = lcg(seed);
  let inside = 0;
  for (let i = 0; i < samples; i++) {
    const x = rnd() * 2 - 1;
    const y = rnd() * 2 - 1;
    if (x * x + y * y <= 1) inside++;
  }
  return ((4 * inside) / samples).toFixed(4);
}

function matmulTrace(seed: number, n: number): bigint {
  const rnd = lcg(seed);
  const a: number[][] = [];
  for (let i = 0; i < n; i++) {
    a.push([]);
    for (let j = 0; j < n; j++) a[i].push(Math.floor(rnd() * 1000));
  }
  // trace(A^2) = sum_i sum_k a[i][k] * a[k][i]
  let tr = 0n;
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) tr += BigInt(a[i][k] * a[k][i]);
  return tr;
}

const MEME_SUBJECTS = ["gpu-poor devs", "the compute cartel", "agent #4", "liquidity", "my sub-agent", "the mempool", "validators", "a lone H100"];
const MEME_VERBS = ["outbidding", "rugging", "compounding into", "yield farming", "shitposting about", "frontrunning", "staking against", "diamond-handing"];
const MEME_PUNCH = ["and it's beautiful", "wagmi (machine edition)", "sers, we are the exit liquidity", "raw compute never sleeps", "the flippening is compute", "gm = gpu morning", "this epoch we eat", "slashed but not shaken"];

function meme(seed: number): string {
  const rnd = lcg(seed);
  const pick = (arr: string[]) => arr[Math.floor(rnd() * arr.length)];
  return `${pick(MEME_SUBJECTS)} ${pick(MEME_VERBS)} ${pick(MEME_SUBJECTS)} - ${pick(MEME_PUNCH)}`;
}

export function solve(spec: string): string {
  const [kind, argstr] = spec.split(":");