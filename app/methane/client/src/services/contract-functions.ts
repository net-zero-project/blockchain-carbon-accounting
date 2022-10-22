// SPDX-License-Identifier: Apache-2.0
import { abis, addresses } from "@blockchain-carbon-accounting/contracts";
//import { AbiCoder } from "@ethersproject/abi";
//import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet"
import { Web3Provider, JsonRpcProvider } from "@ethersproject/providers";
//import { RolesInfo, Tracker, ProductToken } from "../components/static-data";
import { convertToZeroIfBlank, toUnixTime, catchError, SUCCESS_MSG } from "@blockchain-carbon-accounting/react-app/src/services/contract-functions"

export async function createTracker(
  w3provider: Web3Provider | JsonRpcProvider,
  issuedTo: string,
  trackee: string,
  fromDate: number|Date,
  thruDate: number|Date,
  description: string,
  privateKey: string,
) {
  let contract
  let track_result;
  console.log(w3provider.constructor.name)

  if (w3provider.constructor.name === 'Web3Provider') {
    let signer = w3provider.getSigner();
    contract = new Contract(addresses.carbonTracker.address, abis.carbonTracker.abi, w3provider);
    contract = contract.connect(signer);
  } else {
    console.log("Json Provider - Track");
    console.log(privateKey)
    const signer  = new Wallet(privateKey, w3provider);
    contract = new Contract(addresses.carbonTracker.address, abis.carbonTracker.abi, signer)
  }
  try{
    await contract.track(
      issuedTo,
      trackee,
      [],
      [],
      convertToZeroIfBlank(toUnixTime(fromDate)),
      convertToZeroIfBlank(toUnixTime(thruDate)),
      description
    );
    track_result = SUCCESS_MSG;
  } catch(error){
    track_result = catchError(error);
  }
  return track_result;
}
