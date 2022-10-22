import { FC, useState, useEffect } from "react";
import Modal from "react-bootstrap/Modal";
import Button from 'react-bootstrap/Button';

import { BsPlus } from 'react-icons/bs';

import { JsonRpcProvider, Web3Provider } from "@ethersproject/providers";

import type { Product, Operator } from "./static-data";

import RequestProductAudit from "./request-product-audit"
import CreateTrackerForm from "./create-tracker-form"
import { RolesInfo, Wallet, Tracker } from "@blockchain-carbon-accounting/react-app/src/components/static-data";

import { Link } from "wouter";
import { BASE_URL_FRONTEND } from "../services/api.config"

type ProductInfoModalProps = {
  show:boolean
  provider?: Web3Provider | JsonRpcProvider
  signed_in_wallet?:Wallet
  signed_in_address:string
  product: Product
  operator?: Operator
  tracker?: Tracker
  roles: RolesInfo
  handleTrackerCreate:(result:string) => void
  onHide:()=>void 
}
const ProductInfoModal:FC<ProductInfoModalProps> = (props) => {
  const product = props.product;
  const productType = product.type;
  const roles = props.roles
  const [createTrackerFormShow, setCreateTrackerFormShow] = useState(!props.tracker);

  props.product.description = ['Perfomance certificate for', props.operator?.name, product.year, product.division_type, product.division_name, product.sub_division_type, product.sub_division_name].join(' ')

  useEffect(()=>{
    
  }, [])

  function createTrackerHandle(){
    setCreateTrackerFormShow(true)
    console.log(createTrackerFormShow)
  }
  return (
    <Modal {...props} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Product: {props.product.name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {createTrackerFormShow &&
          <CreateTrackerForm operator={props.operator} provider={props.provider} signedInAddress={props.signed_in_address} signedInWallet={props.signed_in_wallet!} trackee={props.operator?.wallet_address!} onSubmitHandle={props.handleTrackerCreate} formSeeds={props.product}/>
        }
        { !createTrackerFormShow && 
          <div><Button className="label-button" variant="outline-dark" onClick={createTrackerHandle}><BsPlus />{`Request a new performance certificate for this product`}</Button></div>
        }
        { !createTrackerFormShow && props.tracker &&
          (productType === 'emissions' && 
            <div className="mt-4">{
            (roles.isAdmin || roles.isAeDealer) ? 
              <Link href={(new URL(`/track/${props.tracker?.trackerId}`, BASE_URL_FRONTEND)).href}>
                <Button variant="outline-dark">Issue Emissions Token</Button>
              </Link>:
              <RequestProductAudit 
                signedInAddress={props.signed_in_address}
                issuedFrom={props.signed_in_address}
                product={props.product}
                tracker={props.tracker}/>
            }</div>
          )
        }

      </Modal.Body>
    </Modal>
  )
}
export default ProductInfoModal;