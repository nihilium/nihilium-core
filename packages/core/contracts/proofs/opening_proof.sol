// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract opening_proof {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 15359511593593216165797774016317054659039621190114466812429587183283920236334;
    uint256 constant deltax2 = 13162109400691899899844098573810770477109487847189623869871188486101664039910;
    uint256 constant deltay1 = 9855623520760674339580545807237723478960130573749369073053031891819467218685;
    uint256 constant deltay2 = 14693939048167565886764315687442343909296765565011947812310586147600335958555;

    
    uint256 constant IC0x = 9761970866701449242619572177136043462848965890015792679188578582396088768072;
    uint256 constant IC0y = 6285718422737921987519628350474004759075630956979750634569116341980067480393;
    
    uint256 constant IC1x = 764526877316443863323417846654304939358229689035992055120208305226589851278;
    uint256 constant IC1y = 12766413561666679292532806580511346520618729579821645739505049117727524133790;
    
    uint256 constant IC2x = 3754270557907593940870269164541794939135948890449878046997261952472258610229;
    uint256 constant IC2y = 10571754524432409557494175079355453878801416739644804049807219055414209037714;
    
    uint256 constant IC3x = 9149575701088504730474001841453029994696084263804934336725970867212099992861;
    uint256 constant IC3y = 10135444418832438772012961869059206447809985238417516900828511224841146329459;
    
    uint256 constant IC4x = 10316528735690399044453614186618204747220990989272873756982785385004584923653;
    uint256 constant IC4y = 5640005100478723762249045487897357086145831099011140173933593598689280507237;
    
    uint256 constant IC5x = 14428932384741962346974739802858665053244639151103508194066882551522897722829;
    uint256 constant IC5y = 455102052319371284217794742490603412778584062428438965557368769355526312403;
    
    uint256 constant IC6x = 864548414700657355244768925367691782928897915566959515930054652652243504006;
    uint256 constant IC6y = 845821633435502868929985311152795518531224623121276649937599877982231528779;
    
    uint256 constant IC7x = 6803378217143796912128073664531439523764800860640756896338793869509284981720;
    uint256 constant IC7y = 4353364966817244104169930884361269430468158972468081286701946075299193444075;
    
    uint256 constant IC8x = 3318880932167112715354916014051679931992393174246933195526750877370463510901;
    uint256 constant IC8y = 4362521810094579677275905468335405409678663891379375418513087945760273510842;
    
    uint256 constant IC9x = 16129794744302170899295421198094296678856858881609869172337325780640644240579;
    uint256 constant IC9y = 5122326048463183577726425447731344103023150399131195055952141336913759563190;
    
    uint256 constant IC10x = 3451677056448347783476830963600045373943524017535975670037756695005518952545;
    uint256 constant IC10y = 5519727052223650477722951224730546640620712785678245290702021029862231583066;
    
    uint256 constant IC11x = 14167814451153010567980227819871152806619220332625176534469715035858167586983;
    uint256 constant IC11y = 12441625163989048805152415843296987669767307925122689006183018007437101309264;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[11] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 

    /**
     * Implements the IVerifier.verify interface.
     * Proof format: abi.encodePacked(
     *   uint[2] _pA,
     *   uint[2][2] _pB,
     *   uint[2] _pC
     * )
     * Public inputs: bytes32[] (must be 11 elements)
     */
    function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external view returns (bool) {
        require(_publicInputs.length == 11, "Invalid number of public inputs");
        // Decode proof
        uint[2] memory _pA;
        uint[2][2] memory _pB;
        uint[2] memory _pC;
        uint offset = 0;
        for (uint i = 0; i < 2; i++) {
            _pA[i] = uint256(bytes32(_proof[offset:offset+32]));
            offset += 32;
        }
        for (uint i = 0; i < 2; i++) {
            for (uint j = 0; j < 2; j++) {
                _pB[i][j] = uint256(bytes32(_proof[offset:offset+32]));
                offset += 32;
            }
        }
        for (uint i = 0; i < 2; i++) {
            _pC[i] = uint256(bytes32(_proof[offset:offset+32]));
            offset += 32;
        }
        // Convert publicInputs (bytes32[]) to uint[]
        uint[11] memory pubSignals;
        for (uint i = 0; i < 11; i++) {
            pubSignals[i] = uint256(_publicInputs[i]);
        }
        return this.verifyProof(_pA, _pB, _pC, pubSignals);
    }

}
