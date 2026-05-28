import { xdr } from '@stellar/stellar-sdk';

export interface ScValType {
  type: 'int' | 'bool' | 'string' | 'address' | 'bytes' | 'vec' | 'map';
  value: any;
}

export class WASMProcessor {
  private static readonly WASM_MAGIC = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);

  static async parseFile(file: File): Promise<Uint8Array> {
    if (!file) {
      throw new Error('No file provided');
    }

    if (!file.name.endsWith('.wasm')) {
      throw new Error('File must be a .wasm file');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    
    // Validate WASM magic number
    if (!this.isValidWASM(bytes)) {
      throw new Error('Invalid WASM file: magic number not found');
    }

    return bytes;
  }

  private static isValidWASM(bytes: Uint8Array): boolean {
    if (bytes.length < 4) return false;
    return (
      bytes[0] === this.WASM_MAGIC[0] &&
      bytes[1] === this.WASM_MAGIC[1] &&
      bytes[2] === this.WASM_MAGIC[2] &&
      bytes[3] === this.WASM_MAGIC[3]
    );
  }

  static toScVal(value: any, type: 'int' | 'bool' | 'string' | 'address' | 'bytes'): xdr.ScVal {
    try {
      switch (type) {
        case 'int':
          const intVal = BigInt(value || '0');
          return xdr.ScVal.scvI64(intVal);
        
        case 'bool':
          const boolVal = value === 'true' || value === true || value === 1;
          return xdr.ScVal.scvBool(boolVal);
        
        case 'address':
          // Simple validation for address format
          const addr = String(value ?? '').trim();
          if (!addr.startsWith('G') && !addr.startsWith('C')) {
            throw new Error('Address must start with G (account) or C (contract)');
          }
          return xdr.ScVal.scvAddress(
            xdr.ScAddress.scAddressTypeAccountId(
              xdr.PublicKey.publicKeyTypeEd25519(
                xdr.Uint256.fromXDR(Buffer.from(addr.slice(1), 'base64'))
              )
            )
          );
        
        case 'bytes':
          const hexStr = String(value ?? '').replace(/^0x/, '');
          return xdr.ScVal.scvBytes(Buffer.from(hexStr, 'hex'));
        
        case 'string':
        default:
          return xdr.ScVal.scvString(String(value ?? ''));
      }
    } catch (error) {
      throw new Error(`Failed to convert value to ${type}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static validateConstructorArgs(args: any[]): string[] {
    const errors: string[] = [];
    
    args.forEach((arg, index) => {
      if (typeof arg === 'string' && arg.trim() === '') {
        errors.push(`Argument ${index}: cannot be empty`);
      }
    });

    return errors;
  }

  static parseArgument(argJson: string): any {
    try {
      return JSON.parse(argJson);
    } catch (error) {
      throw new Error(`Invalid JSON argument: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
