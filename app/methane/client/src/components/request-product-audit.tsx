// SPDX-License-Identifier: Apache-2.0
import { FC, useEffect, useState } from "react";
import { Form } from "react-bootstrap";
import Table from "react-bootstrap/Table";

import { 
  EmissionsFactorForm, 
  defaultEmissionsFactorForm 
} from "@blockchain-carbon-accounting/react-app/src/pages/request-audit"
import { FormSelectRow } from "@blockchain-carbon-accounting/react-app/src/components/forms-util";
import ErrorAlert from "@blockchain-carbon-accounting/react-app/src/components/error-alert";
import SuccessAlert from "@blockchain-carbon-accounting/react-app/src/components/success-alert";
import AsyncButton from "@blockchain-carbon-accounting/react-app/src/components/AsyncButton";
import { createEmissionsRequest } from "@blockchain-carbon-accounting/react-app/src/services/api.service";
import { JsonRpcProvider, Web3Provider } from "@ethersproject/providers";

import { Product } from "../components/static-data";
import { Tracker } from "@blockchain-carbon-accounting/react-app/src/components/static-data";

import { 
  ActivityType, 
  emissionsTypes,
  ghgTypes
} from "@blockchain-carbon-accounting/supply-chain-lib/src/common-types"


type RequestAuditProps = {
  provider?:Web3Provider | JsonRpcProvider
  signedInAddress: string
  issuedFrom: string
  tracker: Tracker
  product:Product
}

type SuccessResultType = {
  emissions: {
    unit: string,
    value: number
  }
  title?: string
}

type EmissionsFactorFormErrors = Partial<EmissionsFactorForm>&{supportingDoc?:string, hasErrors?: boolean}

const RequestProductAudit:FC<RequestAuditProps> = (
  {signedInAddress,issuedFrom,tracker,product}
) => {
  let seededEmForm = defaultEmissionsFactorForm;
  console.log(product)
  seededEmForm = {...seededEmForm,...product as any};
  seededEmForm['issued_from'] = issuedFrom;
  seededEmForm['activity_type'] = 'industry' as ActivityType;
  seededEmForm['activity_amount'] = product.amount.toString();
  seededEmForm['activity_uom'] = product.unit;
  const metadata = JSON.parse(product?.metadata!)
  if(metadata.gwp){seededEmForm['gwp'] = metadata['gwp']};
  const industryEmFormSeededKeys = [ 'issued_from', 'activity_type', 'activity_amount', 'activity_uom', 'country', 'division_type', 'division_name', 'sub_division_type', 'sub_division_name', 'latitude', 'longitude'];
  const [emForm, setEmForm] = useState<EmissionsFactorForm>(seededEmForm)
  
  const utf8Encode = new TextEncoder();
  const byteArray = utf8Encode.encode(JSON.stringify(product));
  const supportingDoc = new File([byteArray],`product_uuid_${product.uuid}`)
  const [validated, setValidated] = useState(false)
  const formErrors:EmissionsFactorFormErrors={};
  const [topError, setTopError] = useState('')
  const [topSuccess, setTopSuccess] = useState<SuccessResultType|null>(null)
  const [loading, setLoading] = useState(false);
//  const [fromDate, setFromDate] = useState<Date|null>(null);
//  const [thruDate, setThruDate] = useState<Date|null>(null);

  useEffect(()=>{
  }, [])

  // Form submit
  const handleSubmit = async(e:any)=>{
    // always stop the event as we handle all in this function
    e.preventDefault()
    e.stopPropagation()
    const form = e.currentTarget
    let valid = true
    if (form.checkValidity() === false) {
      valid = false
    }
    // mark the form to render validation errors
    setValidated(true)
    setTopError('')
    setTopSuccess(null)
    if (valid) {
      setLoading(true)
      console.log('Form valid, submit with', emForm, supportingDoc)
      try {
        // registered users will create an emissions request, non-registered users will just
        // get the calculated emissions
        const res = 
          await createEmissionsRequest(emForm, supportingDoc!, signedInAddress, product.from_date!, product.thru_date!, tracker.trackerId.toString())
        console.log('Form results ', res, res.result.distance, res.result.emissions?.amount)
        const emissions = res?.result?.emissions?.amount
        
        setTopSuccess({ emissions })
      } catch (err) {
        console.warn('Form error ', err)
        setTopError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    } else {
      console.log('Form invalid, check errors:', formErrors)
    }
  }

  return (
    <>
      <h3 style={{display: 'inline'}}>Emission Request</h3>
      <Table hover size="sm">
        <thead>
          <tr>
            <th>Field</th>
            <th>Value</th>
          </tr>
        </thead>

        <tbody>
          {industryEmFormSeededKeys.map((key) => (
            seededEmForm[key] &&
            <tr key={key}>
              <td>{key}</td>
              <td>{seededEmForm[key]}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Form
        onSubmit={handleSubmit}
        noValidate validated={validated}>
        <FormSelectRow form={emForm} setForm={setEmForm} errors={formErrors} field="emissions_type" label="Emissions Type" disabled={!!topSuccess}
          values={emissionsTypes.map(e => {return {value: e, label: e}})}
          onChange={_=>{ setValidated(false) }}
        />
        <FormSelectRow form={emForm} setForm={setEmForm} errors={formErrors} field="ghg_type" label="GHG Type" disabled={!!topSuccess}
          values={ghgTypes.map(e => {return {value: e, label: e}})}
          onChange={_=>{ setValidated(false) }}
        />
        {topError && <ErrorAlert error={topError} onDismiss={()=>{}} />}

        {topSuccess ? <>
          <SuccessAlert title={topSuccess.title || "Request Submitted Successfully"} onDismiss={()=>{}}>
            <div>Calculated emissions: {topSuccess.emissions?.value?.toFixed(3)} {topSuccess.emissions?.unit}{topSuccess.emissions?.unit.endsWith('CO2e')?'':'CO2e'}</div>
          </SuccessAlert>
          </> : <>
            {signedInAddress && 
              <AsyncButton
                className="w-100"
                variant="success"
                loading={loading}
                type="submit"
              >Request Audit</AsyncButton>}
          </>
        } 
      </Form>
    </>
  )
}

export default RequestProductAudit;