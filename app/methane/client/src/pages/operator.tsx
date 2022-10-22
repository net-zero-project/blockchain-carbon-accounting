// SPDX-License-Identifier: Apache-2.0
import {ChangeEvent, MouseEvent, forwardRef, useCallback, useEffect,useImperativeHandle, useState, ForwardRefRenderFunction } from "react";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
import Button from 'react-bootstrap/Button';
import Dropdown from 'react-bootstrap/Dropdown'
import DropdownButton from 'react-bootstrap/DropdownButton';
import TableRow from '@mui/material/TableRow';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';

import { BsFunnel } from 'react-icons/bs';
import { JsonRpcProvider, Web3Provider } from "@ethersproject/providers";
import { getProducts, getOperator, getProductAttributes, getProductTotals } from '../services/api.service';

import type { ProductTotalsAnnual } from "@blockchain-carbon-accounting/data-postgres";

import QueryBuilder from "@blockchain-carbon-accounting/react-app/src/components/query-builder";

import IssuedTrackers from "@blockchain-carbon-accounting/react-app/src/pages/issued-trackers";
import Paginator from "@blockchain-carbon-accounting/react-app/src/components/paginate";
import { Wallet, RolesInfo, Tracker } from "@blockchain-carbon-accounting/react-app/src/components/static-data";
import { productTypes } from "@blockchain-carbon-accounting/oil-and-gas-data-lib/src/product"
import SubmissionModal from "@blockchain-carbon-accounting/react-app/src/components/submission-modal";


import { PRODUCT_FIELDS, Operator, Product } from "../components/static-data";
import ProductInfoModal from "../components/product-info-modal";

import { Link } from "wouter";

/*import { Wrapper, Status } from "@googlemaps/react-wrapper";
import Map, { Marker } from "../components/map"
const render = (status: Status) => {
  return <h1>{status}</h1>;
};*/

type OperatorsProps = {
  provider?: Web3Provider | JsonRpcProvider,
  signedInAddress: string, 
  operatorUuid: string,
  roles: RolesInfo,
  signedInWallet?: Wallet,
}

type OperatorsHandle = {
  refresh: ()=>void
}

const RegisteredOperator: ForwardRefRenderFunction<OperatorsHandle, OperatorsProps> = ({ provider, signedInAddress,operatorUuid,roles,signedInWallet }, ref) => {
  // Modal display and token it is set to
  const [modalShow, setModalShow] = useState(false);
  const [operator, setOperator] = useState<Operator | undefined>()
  const [tracker, setTracker] = useState<Tracker | undefined>()

  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>();
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);

  const [productTotals, setProductTotals] = useState<ProductTotalsAnnual>();

  const [selectFromAssets, setSelectFromAssets] = useState(false);
  const [productCount, setProductCount] = useState(0);

  const [fetchingProducts, setFetchingProducts] = useState(false);
  const [error, setError] = useState("");

  const [fetchingTrackers, setFetchingTrackers] = useState(false);

  const [productSources,setProductSources] = useState<string[]>([]);
  const [productSource,setProductSource] = useState("");
  const [productType,setProductType] = useState("");

  const [result, setResult] = useState("");

  // state vars for pagination
  const [ page, setPage ] = useState(1);
  const [ count, setCount ] = useState(0);
  const [ pageSize, setPageSize ] = useState(20);

  const [ initialized, setInitialized ] = useState(false);

  const productsQueryBase = [
    `operatorUuid,string,${operatorUuid},eq,true`,
  ]
  const [ productsQuery, setProductsQuery ] = useState<string[]>(productsQueryBase);
  const [showQueryBuilder, setShowQueryBuilder] = useState(false);
  const [showProductTotals, setShowProductTotals] = useState(false);
  const [submissionModalShow, setSubmissionModalShow] = useState(false);

  const handleTrackerSelect = tracker => {
    setTracker(tracker);
  };

  const handleTrackerCreate = result => {
    setResult(result)
    console.log(result)
    setSubmissionModalShow(true);
    setModalShow(false);
  };

  async function handlePageChange(_: ChangeEvent<HTMLInputElement>, value: number) {
    await fetchProducts(value, pageSize, productsQuery, selectFromAssets);
  }

  async function handlePageSizeChange(event: ChangeEvent<HTMLInputElement>) {
    await fetchProducts(1, parseInt(event.target.value), productsQuery, selectFromAssets);
  }

  async function handleQueryChanged(_query: string[]) {
    console.log(_query)
    await fetchProducts(1, pageSize, _query.concat(productsQueryBase), selectFromAssets);
  }

  function handleOpenProductInfoModal(product: Product) {
    setSelectedProduct(product);
    setModalShow(true);
  }

  const handleSourceSelect = async (source:string)=>{
    setProductSource(source)
    let _query = productsQuery.concat([`source,string,${source},eq,true`])
    await fetchProducts(1, pageSize, _query,selectFromAssets);
    const { totals } = await getProductTotals(_query,selectFromAssets);
    setProductTotals(totals)
    console.log(totals)
  }

  const handleProductTypeSelect = async (type:string)=>{
    setProductType(type)
    await fetchProducts(1, pageSize, 
      productsQuery.concat([`type,string,${type},eq,true`]), selectFromAssets);
  }


  const fetchProducts = useCallback(async (
    _page: number, 
    _pageSize: number, 
    _query: string[],
    _fromAssets: boolean
  ) => {
    setFetchingProducts(true);

    let newProducts: Product[] = [];
    let _productPageCount = 0;
    try {
      // First, fetch number of unique tokens
      const offset = (_page - 1) * _pageSize;

      const { products, count } = await getProducts(offset,_pageSize,_query,_fromAssets);
      setProductCount(count)
      // this count means total pages of issued tokens
      _productPageCount = count % _pageSize === 0 ? count / _pageSize : Math.floor(count / _pageSize) + 1;

      for (let i = 1; i <= products.length; i++) {
        const product: any = {
          ...products[i-1],
        };
        if (!product) continue;
        newProducts.push(product);
      }


    } catch (error) {
      console.log(error);
      setError("Could not connect to contract on the selected network. Check your wallet provider settings.");
    }
    
    setSelectedProducts(newProducts);
    setFetchingProducts(false);
    setError("");
    setCount(_productPageCount);
    setPage(_page);
    setPageSize(_pageSize);
    setProductsQuery(_query);
  },[]);
  // Allows the parent component to refresh balances on clicking the Dashboard button in the navigation
  useImperativeHandle(ref, () => ({
    refresh() {
      handleRefresh();
    }
  }));

  const fetchProductSources = useCallback(async (
    _query: string[],
    _fromAssets: boolean
  ) => {
    const { attributes } = await getProductAttributes(_query, 'source', _fromAssets)
    setProductSources( attributes )
  },[setProductSources])

  function switchQueryBuilder() {
    setShowQueryBuilder(!showQueryBuilder);
  }

  function switchShowProductTotals() {
    setShowProductTotals(!showProductTotals);
  }

  async function switchFromAssets() {
    setProductSource("")
    setProductType("")
    setProductTotals(undefined)
    setShowProductTotals(false)
    setSelectFromAssets(!selectFromAssets)
    await fetchProductSources(productsQueryBase, !selectFromAssets)
    await fetchProducts(1, 20, productsQueryBase, !selectFromAssets)
  }

  async function handleRefresh() {
    // clear localStorage
    //let localStorage = window.localStorage;
    //localStorage.setItem('token_balances', '');
    await fetchProducts(page, pageSize, productsQueryBase,selectFromAssets);
  }

  // If address and provider detected then fetch balances
  useEffect(() => {
    const init = async () => {
      //console.log('init')
      const { operator } = await getOperator(operatorUuid);
      setOperator(operator)
      await fetchProductSources( productsQuery, selectFromAssets)
      await fetchProducts(1, 20, productsQuery, selectFromAssets);
      setInitialized(true)
    }
    if ( signedInAddress && !initialized) {
      init();
    }
    if(!signedInAddress) {
      // pending for signedInAddress. display the spinner ...
      setFetchingProducts(true);
    }
  }, [ signedInAddress, setOperator, fetchProducts, fetchProductSources,productsQuery,selectFromAssets, operatorUuid, initialized]);

  function pointerHover(e: MouseEvent<HTMLElement>) {
    e.currentTarget.style.cursor = "pointer";
  };

  return (<>
    {selectedProduct && <ProductInfoModal
      provider={provider}
      show={modalShow}
      signed_in_wallet={signedInWallet}
      signed_in_address={signedInAddress}
      product={selectedProduct}
      operator={operator}
      tracker={tracker}
      roles={roles}
      handleTrackerCreate={handleTrackerCreate}
      onHide={() => {
        setModalShow(false);
        setSelectedProduct(undefined);
      }}
    />}
    <SubmissionModal
      show={submissionModalShow}
      title="Request Tracker"
      body={result}
      onHide={() => {setSubmissionModalShow(false); setResult("")} }
    />
    <p className="text-danger">{error}</p>
    <div className={fetchingProducts ? "dimmed" : ""}>

      {fetchingProducts && (
        <div className="text-center my-4">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      )}

      <div className="mt-4">
        <h2>
          Operator: {operator?.name}&nbsp;
          
          <Link href={"/assets/"+operator?.uuid}>
            {operator?.asset_count?.toLocaleString('en-US')} assets
          </Link>
        </h2>

        {operator! ? <IssuedTrackers provider={provider} roles={roles} signedInAddress={signedInAddress} displayAddress={operator?.wallet_address} _showTrackers={'unissued'} handleTrackerSelect={handleTrackerSelect}/> : 
          <div className="text-center my-4">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Loading...</span>
            </Spinner>
          </div>
        }

        <h3 style={{display: 'inline'}}>
          {selectFromAssets ? "Asset level data points" : "Aggregate data points"}{": "+productCount.toLocaleString('en-US')}&nbsp;
        </h3>
        <Dropdown style={{display: 'inline'}}>
          <DropdownButton
            title={productType ? productType :"Product types"}
            style={{display: 'inline'}}
            id="dropdown-menu-align-right"
            onSelect={async (value) => { handleProductTypeSelect(value!)}}>
            { productTypes.slice(0,2).map((type,index) => (
              <Dropdown.Item key={index} eventKey={type}>{type}</Dropdown.Item>
            ))}
          </DropdownButton>
        </Dropdown>
        { productTotals &&
          <Button onClick={switchShowProductTotals}>{showProductTotals ? 'All' : 'Totals'}</Button>
        }
        <Button className="float-end mb-3" onClick={switchQueryBuilder} variant={(showQueryBuilder) ? 'dark' : 'outline-dark'}><BsFunnel /></Button>
        <div hidden={!showQueryBuilder}>
          <QueryBuilder
            fieldList={PRODUCT_FIELDS}
            handleQueryChanged={handleQueryChanged}
            conjunction={true}
          />
        </div>
        <Row className="mt-2">
          <Dropdown as={Col} md={9}>
            <DropdownButton
              //alignRight
              style={{display: 'inline'}}
              title="Source"
              id="dropdown-menu-align-right"
              onSelect={async (value) => { handleSourceSelect(value!)}}>
              { productSources.map((source,index) => (
                <Dropdown.Item key={index} eventKey={source}>{source}</ Dropdown.Item>
              ))}
            </DropdownButton>
            &nbsp;
            {productSource.length>0 && 
                <a href={productSource} target="_blank" rel="noopener noreferrer">{
                  `Product source: ${productSource.split('/').pop()}`}
                </a> 
            }
          </Dropdown>
          <Col md={3}>
            <Button className="float-end" variant="outline-dark" onClick={async () => {await switchFromAssets()}} >{ selectFromAssets ? "Data aggregates" : "Data by asset"}</Button>
          </Col>
        </Row>
        {showProductTotals && productTotals &&
          <Table hover size="sm">
            <Row className="m" size="sm">
              <Col md={4} sm={4} xs={6}>Name</Col>
              <Col md={4} sm={4} xs={6}>Amount</Col>
              <Col md={2} sm={4} xs={6}>Year</Col>
              <Col md={2} sm={4} xs={6}>Country</Col>
            </Row>
            {Object.keys(productTotals).slice(1).map((key,index) => (
              <Row className="mt-4" key={`productTotals${index}`} onClick={() =>handleOpenProductInfoModal(productTotals[key])} onMouseOver={pointerHover}>
                <Col md={4} sm={4} xs={6}>{productTotals[key].name}</Col>
                <Col md={4} sm={4} xs={6}>{productTotals[key].amount.toLocaleString('en-US')}{productTotals[key].unit}</Col>
                <Col md={2} sm={4} xs={6}>{productTotals[key].year}</Col>
                <Col md={2} sm={4} xs={6}>{productTotals[key].country}</Col>

              </Row>
            ))} 
          </Table>
        }
        
        {!!selectedProducts && !showProductTotals && <>
          <Table hover size="sm"><thead>
            <tr>
              <td>Name{/*Col md={4} sm={3} xs={6}*/}</td>
              <td>Amount{/*Col md={4} sm={3} xs={6}*/}</td>
              <td>Year{/*Col md={1} sm={3} xs={6}*/}</td>

              { selectFromAssets ? <td>Asset</td> : <td>Division{/*Col md={3} sm={3} xs={6}*/}</td>}
            </tr></thead>
            <tbody>{selectedProducts.map((product,index) => (
              <tr key={[product?.name,index].join('_')}  onClick={() =>handleOpenProductInfoModal(product)} onMouseOver={pointerHover}>
                <td>{product.name}{/*Col md={4} sm={3} xs={6}*/}</td>
                <td>{(product.amount * (product?.unit==="%" ? 100:1)).toLocaleString('en-US')} {product?.unit}{/*Col md={4} sm={3} xs={6}*/}</td>
                <td>{product?.year}{/*Col md={1} sm={3} xs={6}*/}</td>
                { selectFromAssets ?
                  <td><a href={`https://maps.google.com/?q=${product?.latitude},${product?.longitude}`} target="_blank" rel="noopener noreferrer" >{product?.assets! && product?.assets?.length>0 && product?.assets[0]!.name!}</a>{/*Col md={3} sm={3} xs={6}*/}</td>:
                  <td>{product?.division_type}: {product?.division_name}{/*Col md={3} sm={3} xs={6}*/}</td>
                }
              </tr>
            ))}</tbody>
          </Table>
          <Paginator count={count} page={page} pageSize={pageSize} pageChangeHandler={handlePageChange} pageSizeHandler={handlePageSizeChange} loading={fetchingProducts}/>
        </>}
      </div>
    </div>
  </>);
}


export default forwardRef(RegisteredOperator);
