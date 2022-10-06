import type { AssetOperatorInterface } from "@blockchain-carbon-accounting/oil-and-gas-data-lib";
import { OilAndGasAsset } from "../models/oilAndGasAsset"
import { AssetOperator } from "../models/assetOperator"
import { Operator } from "../models/operator"
import { DataSource, SelectQueryBuilder, FindOptionsWhere, IsNull} from "typeorm"

import { buildQueries, QueryBundle } from "./common"

export class AssetOperatorRepo {

  private _db: DataSource

  constructor(dbConnection: DataSource) {
    this._db = dbConnection
  }
  
  public putAssetOperator = async (doc: AssetOperatorInterface) => {
    try{
      let assetOperator;
      const repo = this._db.getRepository(AssetOperator)
      // find existing asset operator relations 
      const asset_operators = await repo.createQueryBuilder("asset_operator")
      .where("asset_operator.asset.uuid = :assetUuid", { assetUuid: doc.asset.uuid })
      .andWhere("asset_operator.operator.uuid = :operatorUuid", {  operatorUuid: doc.operator.uuid })
      .getMany()
  
      //save new relation if operator does not exsit or is not active (thru date is null)
  
      if(asset_operators.length == 0 || ! asset_operators.map(ao =>(ao.thru_date)).includes(undefined)) {
        assetOperator = await repo.save(doc)
      }
      // TO-DO create separate function to change from/thru dates 
      /*else if(doc.from_date < 
        // reset from_date if sending an ealier thru date
        Min.min(...asset_operators.map(ao =>(ao.thru_date)) )
      ){
        assetOperator.from_date = doc.from_date
        await repo.save(assetOperator)
      }*/
      if(asset_operators.length == 0 && doc.operator){
        //increment asset_count of operator
        doc.operator.asset_count += 1;
        await this._db.getRepository(Operator).save(doc.operator)
      }
    }catch(error){
      throw new Error(`Cannot create asset_operator relation:: ${error}`)       
    }
  }

  public getAssetOperators = async (): Promise<AssetOperator[]> => {
    return await this._db.getRepository(AssetOperator).find()
  }

  public countAssetOwners = async (): Promise<number> => {
    return await this._db.getRepository(AssetOperator).count()
  }

  public selectAssetsPaginated = async (
    offset: number, 
    limit: number, 
    bundles: Array<QueryBundle>
  ): Promise<Array<OilAndGasAsset>> => {
    let selectBuilder: SelectQueryBuilder<AssetOperator> 
      = await this._db.getRepository(AssetOperator).createQueryBuilder("asset_operator")
    // category by issuer address
    selectBuilder = buildQueries('asset_operator', selectBuilder, bundles)
    return selectBuilder
      .innerJoinAndSelect(
        "asset_operator.assets",
        "assets"
      )
      .limit(limit)
      .offset(offset)
      //.orderBy('asset_operators.operator', 'ASC')
      .getRawMany();
  }

  public countAssets = async (
    bundles: Array<QueryBundle>
  ): Promise<number> => {
    let selectBuilder: SelectQueryBuilder<AssetOperator> 
      = await this._db.getRepository(AssetOperator).createQueryBuilder("asset_operator")
    // category by issuer address
    selectBuilder = buildQueries('asset_operator', selectBuilder, bundles)
    return selectBuilder
      .innerJoinAndSelect(
        "asset_operator.assets",
        "assets"
      )
      .select('oil_and_gas_asset.operator')
      .getCount()
  }

}