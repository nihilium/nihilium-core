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

contract Groth16Verifier {
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
    uint256 constant deltax1 = 5328331576984140308030577969233767061622725029575612048352439977265121318708;
    uint256 constant deltax2 = 11701868839278968143218908677046497731189170556594632416501148120114419706154;
    uint256 constant deltay1 = 3781986056350072604751625392157893382870172767731761628042399754162032401323;
    uint256 constant deltay2 = 5878183441033204087100762027334099924202959021648855905583700097687353392184;

    
    uint256 constant IC0x = 2141793286169164885364536406346084502692157742005411296668778241991739803743;
    uint256 constant IC0y = 1869842054831561697348605776776842115607999793912629995552675316822562953688;
    
    uint256 constant IC1x = 13165692785589218189203458602046687203951323125102817034634798985877776899400;
    uint256 constant IC1y = 19247627089715749346973287133298652808419808973840641833355166101827671668878;
    
    uint256 constant IC2x = 3797610921285045627841954111667988957325605406826616013561653808938563828706;
    uint256 constant IC2y = 6849961641197976914763249865498706241888237827639639196822948348705461357675;
    
    uint256 constant IC3x = 1488892199299402725950401961398730878955552464667189765500249346933113363874;
    uint256 constant IC3y = 17430596906098578848077642556018500942276901800314537032009104367649926343973;
    
    uint256 constant IC4x = 7845341765052503986891945644189351213005968405661518695744685786613254255181;
    uint256 constant IC4y = 14880563370907508548714566081807614100286089291321541098216366626335747057068;
    
    uint256 constant IC5x = 7899679628882950882963904638047371822229412690555246695297240090446174647422;
    uint256 constant IC5y = 2747678609216702199270220330433463305039262996758755727563639407653457658533;
    
    uint256 constant IC6x = 13015117886680571663192840192707986967499328639538040688620643477716478421077;
    uint256 constant IC6y = 183045157703725675541543402750052154132039006056942660334550109787306576263;
    
    uint256 constant IC7x = 4879646347481331621596103031887106133801306035004049323554349351881697192266;
    uint256 constant IC7y = 9077809160314193412148115967212381052656713244049727108246852048452659875094;
    
    uint256 constant IC8x = 15413981627126708538213888777209831866466606939647540925864497013104713984058;
    uint256 constant IC8y = 14127407230985481840081451533463654779528566059641278957905455037862005988214;
    
    uint256 constant IC9x = 11383688492041746412696820212279933004353066864287588588681063123065847736328;
    uint256 constant IC9y = 4336714099633522541758183935458462189930984880709545753095711736540420101537;
    
    uint256 constant IC10x = 19193537802281390211309406857734827916290519298670944944312766108271263815478;
    uint256 constant IC10y = 7295271307105507092243516878176685723850321164715266977365061671833049073777;
    
    uint256 constant IC11x = 15891975651935206940666699352704753568872305110610514555158005510923620385243;
    uint256 constant IC11y = 4934485595826387082946783138301870674489584430596630659723976148564143885890;
    
    uint256 constant IC12x = 15730223808257441570345038770984026142576254406061960343805218963984372603984;
    uint256 constant IC12y = 10684222585887480567341740940415520336457126308949479811410541968734435970518;
    
    uint256 constant IC13x = 13454058815561100895441606293858641439017236197185455946372166613499434323743;
    uint256 constant IC13y = 15318824835375246345678050687816170704020049161649406002553557021474158165934;
    
    uint256 constant IC14x = 18163182815567576503617729405343371084966406485453363436233774293008967499616;
    uint256 constant IC14y = 15993778205332657168927463347700929984700148975846498164262023497925347527960;
    
    uint256 constant IC15x = 10400684650473324029430795545783257072296635998286952727575367191091062835555;
    uint256 constant IC15y = 18758224522620558784203347406970278281563576242692683703789410205233387198055;
    
    uint256 constant IC16x = 9496381154490802098193461080013616926785028221992005050910429353918378466327;
    uint256 constant IC16y = 5266282185184365694825753154761700433688592095559073917186609148643537038795;
    
    uint256 constant IC17x = 6721108152269331205874081428045902126135235979712671766040274270761326803871;
    uint256 constant IC17y = 7655307172473809475759053424328667733760107057341362489949874372718621328210;
    
    uint256 constant IC18x = 14424175326672584500564220417880803459563147714221194123809978174457085608133;
    uint256 constant IC18y = 1517316313370717602341548733277443570942074299894695425533644123845121774505;
    
    uint256 constant IC19x = 856909026610933708740376752756484490788951331979705837537800292547381192548;
    uint256 constant IC19y = 6225610377245105274424533972266954048586817981605654633128986073476632636092;
    
    uint256 constant IC20x = 11962660678319646543448834061338529418011427710531077738620945375358503618910;
    uint256 constant IC20y = 9255043603272917621770212500769586225330780241338331175630912368324201949656;
    
    uint256 constant IC21x = 19720379131630143148196838669236583078396812958726023132785661787023870581008;
    uint256 constant IC21y = 21417961585491591487235602011832337239659894614557608576468751466627573888531;
    
    uint256 constant IC22x = 5396573328540300568201049138110583495851245934487710521961051043330588154700;
    uint256 constant IC22y = 16801370073056888152904507887402359585160860982262607609309667098986952598049;
    
    uint256 constant IC23x = 11874747381830304977250244437954958857097576776324643247627080361631620471570;
    uint256 constant IC23y = 12504478060200955670641999310824384799318499593301900392251738726336415693989;
    
    uint256 constant IC24x = 13901846627671161657062832095403879495536871921832549553859775626697050905697;
    uint256 constant IC24y = 20715433770934442820032700011078678336858014668900568256511202727927120828426;
    
    uint256 constant IC25x = 19600968480927959386721083817332095227859615773177591439567942874958495253401;
    uint256 constant IC25y = 11773094453274707696978687135371980032186007237880941313629386471379403577844;
    
    uint256 constant IC26x = 5958928156099274908271946109260695998067993981286715131898552804154103442756;
    uint256 constant IC26y = 13536142660958295129153646144970149748636606008751809137674608705181911088102;
    
    uint256 constant IC27x = 15455835631666534329967790259116234520822063795626489807777326510018111055538;
    uint256 constant IC27y = 15608191063454330858053407616113045367600223359048189110202963092346772023098;
    
    uint256 constant IC28x = 6425848756124445081250890389680586869094674821098250638987230255453422078521;
    uint256 constant IC28y = 8594929778260695928753576717099370978018315616157415483815868270868186906517;
    
    uint256 constant IC29x = 10362310702336450244675437379673571895309025277408541549241630843240076507562;
    uint256 constant IC29y = 20718703867944489423319193883940648382497739988948054244010926980545661070784;
    
    uint256 constant IC30x = 5089428622857773020635660506408901342046539465826015131097559780765419368624;
    uint256 constant IC30y = 1097228952640368680066791734809415460045101140851389517847088774374645922681;
    
    uint256 constant IC31x = 17289991289960817676023233859202737577400631884127490674130641731628867765159;
    uint256 constant IC31y = 2709930737889801904211113203736428022507157833864116621328807072477612525704;
    
    uint256 constant IC32x = 4932816725390377930463831119841332339488404278915757482140793696885098415771;
    uint256 constant IC32y = 4417724813775024372858715202764667847166277108542498577087161452413697966562;
    
    uint256 constant IC33x = 12567821554347630826450884009990862020162675813110168187220559346379468724888;
    uint256 constant IC33y = 13596602693482923305881369638591098010141432176298455199715963416398621789594;
    
    uint256 constant IC34x = 16865277016609527264586365168941704230884835014700663737499317140959659167294;
    uint256 constant IC34y = 11651806209579119297338616976132737490102477258261632189599790085899854515507;
    
    uint256 constant IC35x = 1702661546263524363661807574025019935329677352892266125441303919460322365758;
    uint256 constant IC35y = 16234182288791307139565510512081695275830962887989518940876920110230607197909;
    
    uint256 constant IC36x = 505622658879371017826500327863891391695770317400853199712502462892550558508;
    uint256 constant IC36y = 12309703702613163457592505366029876598351856121637262922301199332259258325797;
    
    uint256 constant IC37x = 14039476823345788351779477656906210918094220149330026832143787698415882714033;
    uint256 constant IC37y = 1700191298569414401518494742916631432512203278276147554319451220161748283622;
    
    uint256 constant IC38x = 17223028483180886269276586777831258578876676766297947668913987033313077334755;
    uint256 constant IC38y = 6650196811095344083890061850063705971119460331307446424717081101809460623259;
    
    uint256 constant IC39x = 4685425471599189923683336034831402604245604998728975381580511733082662399631;
    uint256 constant IC39y = 20329106202355971318411478419069923169285211053556902978067698564177743531943;
    
    uint256 constant IC40x = 17363738489045393201374318249283423252087330052292450118222981778628464236279;
    uint256 constant IC40y = 15874311756092778548731599496373255620977905855642704326446445481244356077878;
    
    uint256 constant IC41x = 17198572591090799187630472342544987190507138540903788423533782779968026836992;
    uint256 constant IC41y = 13003491805469586674190738026749582194371586419222857223618259929358378020998;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[41] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                
                g1_mulAccC(_pVk, IC21x, IC21y, calldataload(add(pubSignals, 640)))
                
                g1_mulAccC(_pVk, IC22x, IC22y, calldataload(add(pubSignals, 672)))
                
                g1_mulAccC(_pVk, IC23x, IC23y, calldataload(add(pubSignals, 704)))
                
                g1_mulAccC(_pVk, IC24x, IC24y, calldataload(add(pubSignals, 736)))
                
                g1_mulAccC(_pVk, IC25x, IC25y, calldataload(add(pubSignals, 768)))
                
                g1_mulAccC(_pVk, IC26x, IC26y, calldataload(add(pubSignals, 800)))
                
                g1_mulAccC(_pVk, IC27x, IC27y, calldataload(add(pubSignals, 832)))
                
                g1_mulAccC(_pVk, IC28x, IC28y, calldataload(add(pubSignals, 864)))
                
                g1_mulAccC(_pVk, IC29x, IC29y, calldataload(add(pubSignals, 896)))
                
                g1_mulAccC(_pVk, IC30x, IC30y, calldataload(add(pubSignals, 928)))
                
                g1_mulAccC(_pVk, IC31x, IC31y, calldataload(add(pubSignals, 960)))
                
                g1_mulAccC(_pVk, IC32x, IC32y, calldataload(add(pubSignals, 992)))
                
                g1_mulAccC(_pVk, IC33x, IC33y, calldataload(add(pubSignals, 1024)))
                
                g1_mulAccC(_pVk, IC34x, IC34y, calldataload(add(pubSignals, 1056)))
                
                g1_mulAccC(_pVk, IC35x, IC35y, calldataload(add(pubSignals, 1088)))
                
                g1_mulAccC(_pVk, IC36x, IC36y, calldataload(add(pubSignals, 1120)))
                
                g1_mulAccC(_pVk, IC37x, IC37y, calldataload(add(pubSignals, 1152)))
                
                g1_mulAccC(_pVk, IC38x, IC38y, calldataload(add(pubSignals, 1184)))
                
                g1_mulAccC(_pVk, IC39x, IC39y, calldataload(add(pubSignals, 1216)))
                
                g1_mulAccC(_pVk, IC40x, IC40y, calldataload(add(pubSignals, 1248)))
                
                g1_mulAccC(_pVk, IC41x, IC41y, calldataload(add(pubSignals, 1280)))
                

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
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            
            checkField(calldataload(add(_pubSignals, 608)))
            
            checkField(calldataload(add(_pubSignals, 640)))
            
            checkField(calldataload(add(_pubSignals, 672)))
            
            checkField(calldataload(add(_pubSignals, 704)))
            
            checkField(calldataload(add(_pubSignals, 736)))
            
            checkField(calldataload(add(_pubSignals, 768)))
            
            checkField(calldataload(add(_pubSignals, 800)))
            
            checkField(calldataload(add(_pubSignals, 832)))
            
            checkField(calldataload(add(_pubSignals, 864)))
            
            checkField(calldataload(add(_pubSignals, 896)))
            
            checkField(calldataload(add(_pubSignals, 928)))
            
            checkField(calldataload(add(_pubSignals, 960)))
            
            checkField(calldataload(add(_pubSignals, 992)))
            
            checkField(calldataload(add(_pubSignals, 1024)))
            
            checkField(calldataload(add(_pubSignals, 1056)))
            
            checkField(calldataload(add(_pubSignals, 1088)))
            
            checkField(calldataload(add(_pubSignals, 1120)))
            
            checkField(calldataload(add(_pubSignals, 1152)))
            
            checkField(calldataload(add(_pubSignals, 1184)))
            
            checkField(calldataload(add(_pubSignals, 1216)))
            
            checkField(calldataload(add(_pubSignals, 1248)))
            
            checkField(calldataload(add(_pubSignals, 1280)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
