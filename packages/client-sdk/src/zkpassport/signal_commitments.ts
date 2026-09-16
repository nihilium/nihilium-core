import { ethers } from "ethers";
import { getDiscloseEVMParameterCommitment,
     getAgeEVMParameterCommitment, getDateEVMParameterCommitment,
    getBindEVMParameterCommitment, formatBoundData, ProofType } from "@zkpassport/utils";
import * as nhsdk from "@nihilium/core";
const MRZ_BUFFER_LEN = 90;            // typical MRZ buffer length in ci    rcuits
const MRZ_NAME_FIELD_LEN = 39;        // TD3 name-field length
const DEFAULT_NAME_OFFSET_IN_MRZ90 = 5; // common placement; adjust if needed

// ProofType comes from @zkpassport/utils. It used to be a hand-copied table here, and only the
// one value ever exercised (AGE = 1) was right: it had GENDER at 2 where the real enum has
// BIRTHDATE, and BIRTHDATE at 6 where the real enum has ISSUING_COUNTRY_INCLUSION. Committing with
// the wrong proof type produces a well-formed commitment that matches nothing.


const EVM_SIGNAL_MAP_INDEX:{[key:number]: any} = {
    7: {
        age: [5, 1],
        name: [6, 1],
        customData: [7, 2],
        
    }
}



  /**
   * A date-of-birth condition, as the range the passport must fall in. Maps straight onto
   * getDateEVMParameterCommitment's min/max arguments.
   */
  export type BirthdateRange = { min: Date; max: Date };

  /**
   * An age condition, as the range the holder must fall in. Maps straight onto
   * getAgeEVMParameterCommitment's (minAge, maxAge) arguments.
   *
   * `max: 0` is ZKPassport's own "no upper bound" -- not "at most zero". Both ends default to 0 in
   * their circuit inputs, so `gte("age", n)` arrives here as `{ min: n, max: 0 }`. Use atLeastAge()
   * rather than writing that literal.
   */
  export type AgeRange = { min: number; max: number };

  /**
   * "At least n" -- the condition the ZKPassport app produces for `gte("age", n)`.
   *
   * This is the range to seal against for an over-18 style gate. See ZKPassportMinimumAgeModule.
   */
  export const atLeastAge = (n: number): AgeRange => ({ min: n, max: 0 });

  /**
   * The claims a seal is gated on. Supply `age` OR `birthdate`, not both: they occupy the same
   * parameter-commitment slot, and the module that consumes them gates on one or the other.
   * See ZKPassportAgeModule and ZKPassportBirthdateModule for which to pick.
   */
  export type SignalCommitmentRequest = {
    age?: AgeRange;
    birthdate?: BirthdateRange;
    firstname?: string;
    lastname?: string;    
    customData?: string;
  }

  export function hashSignalCommitmentRequest(signalCommitmentRequest: SignalCommitmentRequest): string {
    return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(signalCommitmentRequest)));
  }

  export type SignalCommitmentResponse = {
    age?: {[key:number]: string[]};
    birthdate?: {[key:number]: string[]};
    firstname?: {[key:string]: string[]};
    lastname?: {[key:string]: string[]};    
    customData?: {[key:string]: string[]};
  }


  /**
   * Generates a merkle tree of possible signal variants
   * @param signalCommitments 
   * @returns MerkleTree for which the root is the commitment
   */
  /** Depth of the keccak tree over the candidate commitments. Must match ZKPassportModule's. */
  export const SIGNAL_TREE_DEPTH = 8;

  /**
   * The candidate commitments that form the merkle tree, in tree order.
   *
   * This is the single definition of that ordering, and both sides depend on it: the sealer
   * commits to the root of a tree built from this array, and @nihilium/core's ZKPassportModule
   * rebuilds the identical tree from the same array at unseal time. Reorder it and previously
   * created seals stop opening.
   *
   * customData is deliberately not a leaf -- it is proven through FormatBoundData against the
   * seal's reveal value, not by membership.
   */
  export function getSignalLeaves(signalCommitments: SignalCommitmentResponse): string[] {
    // Claim first, then name. `age` and `birthdate` are alternatives for the same slot, so at most
    // one is present and the ordering stays the same shape whichever it is.
    const claim = signalCommitments.age ?? signalCommitments.birthdate;
    const leaves: string[] = [];
    for (const group of [claim, signalCommitments.firstname]) {
        if (!group) continue;
        for (const values of Object.values(group)) {
            for (const value of values) {
                leaves.push(value);
            }
        }
    }
    return leaves;
  }

  /**
   * The commitment material @nihilium/core's ZKPassportModule takes as a production input. Core
   * cannot derive this itself -- it would need ZKPassport's own parameter-commitment functions,
   * and core takes no ZKPassport dependency.
   */
  export function getCommitments(
    signalCommitments: SignalCommitmentResponse, customDataIndex: number = 7,
  ): { leaves: string[]; custom_data: string[] } {
    return {
        leaves: getSignalLeaves(signalCommitments),
        custom_data: signalCommitments.customData?.[customDataIndex] ?? [],
    };
  }

  // The tree type is taken from core's own copy of fixed-merkle-tree: importing MerkleTree
  // directly would clash nominally on its private _buildHashes field wherever a consumer resolves
  // a second physical copy of the same package.
  export function getMerkleCommitment(
    signalCommitments: SignalCommitmentResponse, signal_index: number = SIGNAL_TREE_DEPTH,
  ): ReturnType<typeof nhsdk.utils.createKeccakMerkelTreeSync> {
    return nhsdk.utils.createKeccakMerkelTreeSync(signal_index, getSignalLeaves(signalCommitments));
  }

  export function verifySignalCommitments(signalCommitments: SignalCommitmentResponse, publicSignals: string[]): boolean {

    if (signalCommitments.age) {
        var found = false;
        for (const [key, values] of Object.entries(signalCommitments.age)) {
            for (const value of values) {
            
                var index = publicSignals.indexOf(value);
                if (index > -1) {
                    console.log((Number(key) == index),"Age commitment", value, "found at index", index, "Should be:", key);
                    found = true;
                }
                if (index === -1) {
                    console.log("Age commitment", value, "not found in public signals");
                }
            }
        }
        if (!found) {
            console.log("Age commitment not found in public signals");
            return false;
        }
    }
    if (signalCommitments.birthdate) {
        var birthdateFound = false;
        for (const values of Object.values(signalCommitments.birthdate)) {
            for (const value of values) {
                if (publicSignals.indexOf(value) > -1) {
                    birthdateFound = true;
                }
            }
        }
        if (!birthdateFound) {
            console.log("Birthdate commitment not found in public signals");
            return false;
        }
    }
    if (signalCommitments.firstname) {
        var found = false;
        for (const [key, values] of Object.entries(signalCommitments.firstname)) {
            for (const value of values) {
                
                var index = publicSignals.indexOf(value);
                if (index > -1) {
                    console.log((Number(key) == index),"Firstname commitment", value, "found at index", index, "Should be:", key);
                    found = true;
                }
                if (index === -1) {
                    console.log("Firstname commitment", value, "not found in public signals");
                }
                
            }
        }
        if (!found) {
            console.log("Firstname commitment not found in public signals");
            return false;
        }
    }
    if(signalCommitments.customData) {
        var found = false;
        for (const [key, values] of Object.entries(signalCommitments.customData)) {
            for (const value of values) {
                var index = publicSignals.indexOf(value);
                if (index > -1) {
                    console.log((Number(key) == index),"Custom data commitment", value, "found at index", index, "Should be:", key);
                    found = true;
                }
                if (index === -1) {
                    console.log("Custom data commitment", value, "not found in public signals");
                }
            }
        }
        if (!found) {
            console.log("Custom data commitment not found in public signals");
            return false;
        }
    }
    return true;
}  
    

  export async function generateSignalCommitments(signals: SignalCommitmentRequest, evmSignalMapIndex: number = 7) {
    const results: SignalCommitmentResponse = {};
    const evmSignalMap:any = EVM_SIGNAL_MAP_INDEX[evmSignalMapIndex];
    if (signals.age && signals.birthdate) {
      throw new Error(
        "Supply age or birthdate, not both: they occupy the same parameter-commitment slot. " +
        "Use ZKPassportAgeModule for a current-age condition, ZKPassportBirthdateModule for a " +
        "fixed date-of-birth one.");
    }
    if (signals.age) {
      results.age = { [evmSignalMap.age[0]]: (await findAgeMatches(signals.age)) };
    }
    if (signals.birthdate) {
      // Same slot as age -- the claim is what differs, not where it sits.
      results.birthdate = { [evmSignalMap.age[0]]: (await findBirthdateMatches(signals.birthdate)) };
    }
    if (signals.firstname && signals.lastname) {
      results.firstname = { [evmSignalMap.name[0]]:
         (await generateFirstnameDiscloseCommitmentCandidates({firstName: signals.firstname, lastName: signals.lastname})).map(v => v.commitmentHex) };
    }
    
    if (signals.customData) {
        var value = (await getBindEVMParameterCommitment(formatBoundData({custom_data: signals.customData}))).toString(16)
        console.log("customData", value);
        results.customData = { [evmSignalMap.customData[0]]: ["0x" + value.padStart(64, "0")] };
    }
    return results;
  }



  export interface FirstnameDiscloseMaskCandidate {
   
    label: string;               // description of how we built this candidate
    country?: string;
    mrzNameField: string;        // 39-char MRZ name field we assumed
    nameOffsetInMrz90: number;   // where that field starts in 90-byte buffer
    discloseMask: number[];      // length 90
    disclosedBytes: number[];    // length 90, MRZ ascii or 0 for '<'
    firstNameSlice: { start: number; end: number; substring: string }; // MRZ indices [0..38]
  }
  
  /** Same + commitment, ready to check against public signals */
  export interface FirstnameDiscloseCommitmentCandidate
    extends FirstnameDiscloseMaskCandidate {
    commitment: bigint;          // result from getDiscloseParameterCommitment
    commitmentHex: string;       // 0x-prefixed hex
  }

/** Generic Latin → MRZish normalizer for name parts */
function normalizeForMrz(s: string): string {
    return s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // strip accents (é → e)
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")    // drop punctuation
      .trim()
      .replace(/ +/g, " ");           // single spaces
  }
  
  /**
   * Build candidate 39-char MRZ name fields from human names.
   * You can add more country-specific cases later.
   *
   * Examples for ("Olaf", "van Wijk"):
   *  - "VAN<WIJK<<OLAF<<<<<<<<<<<<<<<<<<<"
   *  - "VANWIJK<<OLAF<<<<<<<<<<<<<<<<<<<"
   */
 
 export function buildMrzNameFieldCandidates(
    firstName: string,
    lastName: string,
    country?: string
  ): string[] {
    const normFirst = normalizeForMrz(firstName); // "OLAF"
    const normLast = normalizeForMrz(lastName);   // "VAN WIJK"
    
    const candidates = new Set<string>();
  
    // surname variants (space preserved vs collapsed)
    const surnameBaseVariants = new Set<string>([
      normLast,                    // "VAN WIJK"
      normLast.replace(/ /g, ""),  // "VANWIJK"
    ]);
  
    for (const surnameBase of surnameBaseVariants) {
      // map spaces to '<' for MRZ
      const surnameWithAngles = surnameBase.replace(/ /g, "<"); // "VAN<WIJK"
      const surnameNoSpace = surnameBase.replace(/ /g, "");     // "VANWIJK"
  
      const surnameVariants = new Set<string>([
        surnameWithAngles,
        surnameNoSpace,
      ]);
  
      for (const surname of surnameVariants) {
        // first name, spaces → '<' (rarely used but included for completeness)
        const given = normFirst.replace(/ /g, "<"); // usually "OLAF"
  
        let field = `${surname}<<${given}`; // SURNAME<<GIVEN
        if (field.length > MRZ_NAME_FIELD_LEN) {
          // If it's too long, skip this variant
          continue;
        }
        field = field.padEnd(MRZ_NAME_FIELD_LEN, "<");
        candidates.add(field);
      }
    }
  
    return [...candidates];
  }
  

  /**
 * Given a 39-char MRZ name field, find first given name slice.
 * Format: SURNAME<<GIVEN<NAMES... padded with '<'
 */
export function sliceFirstGivenFromMrzNameField(mrzNameField: string) {
    if (mrzNameField.length !== MRZ_NAME_FIELD_LEN) {
      throw new Error(`MRZ name field must be ${MRZ_NAME_FIELD_LEN} chars`);
    }
  
    const s = mrzNameField;
    const sep = s.indexOf("<<");
    if (sep < 0) {
      throw new Error("MRZ name field missing '<<' separator");
    }
  
    const givenStartRaw = sep + 2;
    let start = givenStartRaw;
  
    // skip leading '<' in given-name area
    while (start < MRZ_NAME_FIELD_LEN && s[start] === "<") start++;
  
    let end = start;
    while (end < MRZ_NAME_FIELD_LEN && s[end] !== "<") end++;
  
    return {
      sepIndex: sep,
      start,                    // index in [0..38]
      end,                      // exclusive
      substring: s.slice(start, end), // first given name as MRZ substring
      fullField: s,
    };
  }
  
  export interface FirstnameMaskGenOptions {
    firstName: string;
    lastName: string;
    country?: string;
    /** where the 39-char name field starts in the 90-byte buffer */
    nameOffsetInMrz90?: number;
  }
  
  export function generateNameDiscloseMaskCandidates(
    opts: FirstnameMaskGenOptions
  ): FirstnameDiscloseMaskCandidate[] {
    const {
      firstName,
      lastName,
      country,
      nameOffsetInMrz90 = DEFAULT_NAME_OFFSET_IN_MRZ90,
    } = opts;
  
    const mrzCandidates = buildMrzNameFieldCandidates(firstName, lastName, country);
    const results: FirstnameDiscloseMaskCandidate[] = [];
  
    for (const mrzNameField of mrzCandidates) {
      const slice = sliceFirstGivenFromMrzNameField(mrzNameField);
      const mrzChars = mrzNameField.split("");
  
      // windows:
      //  - strict first-name chars
      //  - from '<<' through end of first name (includes separators)
      const windowStrict = { start: slice.start, end: slice.end };
      const windowWithSep = { start: 0, end: slice.end };
  
      const windows = [
        //{ label: "fname_only_window", range: windowStrict },
        { label: "fname_plus_sep_window", range: windowWithSep },
      ];
  
      for (const { label: winLabel, range } of windows) {
        // byte-fill strategies:
        //  - full name field bytes present
        //  - only bytes inside the window present
        const strategies: Array<{ label: string; fullField: boolean }> = [
          { label: "full_name_bytes", fullField: true },
          { label: "window_only_bytes", fullField: false },
        ];
  
        for (const { label: stratLabel, fullField } of strategies) {
          const mask = new Array<number>(MRZ_BUFFER_LEN).fill(0);
          const bytes = new Array<number>(MRZ_BUFFER_LEN).fill(0);
  
          // Fill bytes
          if (fullField) {
            // place whole 39-char field
            for (let i = 0; i < MRZ_NAME_FIELD_LEN; i++) {
              const globalIdx = nameOffsetInMrz90 + i;
              const ch = mrzChars[i];
              bytes[globalIdx] = ch === "<" ? 0 : ch.charCodeAt(0);
            }
          } 
          for (let i = range.start; i < range.end; i++) {
            const globalIdx = nameOffsetInMrz90 + i;
            const ch = mrzChars[i];
            bytes[globalIdx] = ch === "<" ? 60 : ch.charCodeAt(0);
          }
  
          // Fill mask: reveal non-filler characters in the chosen window
          for (let i = range.start; i < range.end; i++) {
            const globalIdx = nameOffsetInMrz90 + i;
            const ch = mrzChars[i];
            //if (ch !== "<") {
              mask[globalIdx] = 1;
            //}
          }
  
          results.push({
          
            label: `${country ?? "XX"}::${mrzNameField}::${winLabel}::${stratLabel}`,
            country,
            mrzNameField,
            nameOffsetInMrz90,
            discloseMask: mask,
            disclosedBytes: bytes,
            firstNameSlice: {
              start: slice.start,
              end: slice.end,
              substring: slice.substring,
            },
          });
        }
      }
    }
  
    return results;
  }
  /**
 * For a given human name, generate mask/byte candidates *and*
 * compute their commitments using zkpassport/utils.
 */
export async function generateFirstnameDiscloseCommitmentCandidates(
    opts: FirstnameMaskGenOptions
  ): Promise<FirstnameDiscloseCommitmentCandidate[]> {
    const masks = generateNameDiscloseMaskCandidates(opts);
  
    const results: FirstnameDiscloseCommitmentCandidate[] = [];
  
    for (const m of masks) {
      const commitment = await getDiscloseEVMParameterCommitment(
        m.discloseMask,
        m.disclosedBytes
      );
  
      const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");
  
      results.push({
        ...m,
        commitment,
        commitmentHex,
      });
    }
  
    return results;
  }
  

/** Parameter commitments are compared as 32-byte hex, so normalise once here. */
const toCommitmentHex = (commitment: bigint): string =>
    ethers.zeroPadValue(ethers.toBeHex(commitment), 32);

  /**
   * The commitment for an age condition. Exactly one, like birthdate: the sealer states the range,
   * so there is nothing to guess.
   *
   * It used to fan out to three candidates -- (n, n+1), (n, 0) and (0, n+1) -- because the query
   * shape the app would use was unknown. That was unsound: ZKPassportClaimModule opens on
   * membership of ANY leaf and the holder picks the query, so a seal for "age 18" also opened for
   * someone who proved `lte("age", 19)`. The range is now the sealer's to state; an exact-age gate
   * is the application passing the range it means, rather than a `+ 1` baked in here.
   *
   * ZKPassport's own encoding, for choosing that range (both ends default to 0):
   *   gte(n) -> (n, 0)     gt(n)  -> (n+1, 0)     range(a, b) -> (a, b)
   *   lte(n) -> (0, n)     lt(n)  -> (0, n-1)     eq(n)       -> (n, n)
   */
  export const findAgeMatches = async (range: AgeRange): Promise<string[]> => {
    // min and max are single bytes in the commitment payload
    // [ProofType.AGE, 0x00, 0x02, min, max], so anything outside a byte silently truncates.
    for (const [label, value] of [["min", range.min], ["max", range.max]] as const) {
      if (!Number.isInteger(value) || value < 0 || value > 0xff) {
        throw new Error(
          `age ${label} must be an integer in 0..255: it is one byte of the parameter-commitment ` +
          `payload, so ${value} would not survive the encoding.`);
      }
    }
    // max 0 is "no upper bound", so only a real upper bound can be inverted.
    if (range.max !== 0 && range.max < range.min) {
      throw new Error("age range is inverted: max is below min");
    }
    return [toCommitmentHex(await getAgeEVMParameterCommitment(range.min, range.max))];
  }

  /**
   * The commitment for a date-of-birth condition. Exactly one, like age and unlike name: the
   * sealer chose the range, so there is nothing to guess.
   *
   * getDateEVMParameterCommitment applies birthdateOffset (default SECONDS_BETWEEN_1900_AND_1970)
   * itself, so plain epoch-1970 seconds go in -- adding the offset here would double-count it.
   */
  export const findBirthdateMatches = async (range: BirthdateRange): Promise<string[]> => {
    const minTs = Math.floor(range.min.getTime() / 1000);
    const maxTs = Math.floor(range.max.getTime() / 1000);
    if (maxTs < minTs) {
      throw new Error("birthdate range is inverted: max is earlier than min");
    }
    return [toCommitmentHex(await getDateEVMParameterCommitment(ProofType.BIRTHDATE, minTs, maxTs))];
  }