// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Receiver.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./NetEmissionsTokenNetwork.sol";

/**

CarbonTracker is a contract used to transfer embedded emissions of products in a supply chain.  
See https://wiki.hyperledger.org/display/CASIG/2022-09-12+Peer+Programming+Call
Key concepts are:
 - Product is something that has embedded emissions.  
   Oil and natural gas, plastics, electricity, square feet of office, etc ...  
 - CarbonTracker tokens reference Products and tokens from the NET network,
   These represent product specific emission certificates for industry 
 - Products have various attribtutes
    - normalized amounts that assign a weighted distribution of the 
      CarbonTracker emissions to each product. Could be normalize energy 
      content, e.g., BOE (barrels of oil equivalent), if emissions are 
      allocated propotional to energy content of products, or unitless.
    - Arrays of units and unit amounts used to store specific attributes.  
      For example gallons for oil and cubic feet of natural gas.    
 - Trackee is the registered entitity that the tracker is issued for. 
   E.g., a natural gas utility.

Workflow of the token:
 - Auditors registered with NET issue CarbtonTracker tokens
 - track() to create, or trackUpdate() to update an existing, tracker
    - these functions assign NETs to the tracker
 - productsUpdate() for auditors to assign unique product amounts to a tracker
 - audit() to mark a tracker as Audited 
    - approve an industry emission certificate
    - allow its products to be transfered to other accounts
 - transferProduct() to another trackee, customer, auditor, ...
    - The entire audited CarbonTracker can also be transffered, 
      e.g., to an emission certificate dealer, investor, ...
 - trackProduct() track a previously issued product to a new tracker ID.
    - This funciton enables tracking accross product supply chains 
 - getTotalEmissions() - calculate the total emissions of the CarbonTracker 
     -based on its emissions network tokens
 - create to create another tracker, for example by the customer for its product.  For example, it could be plastics or office space.
 - transferProductToTracker - transfer some of the original product to the new tracker.  For example, transfer cubic feet of natural gas to plastics or office space.
   This transfers the emissions through the supply chain from one product to another.

**/

contract CarbonTracker is ERC721, AccessControl, ERC1155Holder {
    using SafeMath for uint256;
    using Counters for Counters.Counter;
    using ECDSA for bytes32;
    using ECDSA for address;

    NetEmissionsTokenNetwork public net;
    address public netAddress;

    // Registered Tracker
    bytes32 public constant REGISTERED_TRACKER =
        keccak256("REGISTERED_TRACKER");

    /**
     * @dev tracker details
     * trackerId
     * trackee - address of the account the tracking will apply to
     * auditor - address of the tracker
     **/
    struct CarbonTrackerDetails {
        uint256 trackerId;
        address trackee;
        address auditor;
        uint256 totalProductAmounts;
        uint256 fromDate;
        uint256 thruDate;
        address createdBy;
        uint256 dateCreated;
        uint256 dateUpdated;
        string metadata;
        string description;
    }
    /**
     * @dev tracker mappings
     * tokenIds - array of ids of carbon tokens (direct/indirect/offsets)
     * idIndex - mapping tokenId to its index in array. 1st index is 1, 0 reserved for unindexed
     * amount - mapping tokenId to amount of emissions
     * productIds - array of productIds
     * productIdIndex mapping productId to index in array
     * trackerIds - arrays of tracker ids referenced by this tracker
     * trackerIndex - mapping sourceTrackerId to index in array. 1st index is 1, 0 reserved for unindexed.
     * productsTracked - map trackerId to information about productsTracked
     **/
    struct CarbonTrackerMappings {
        uint256[] tokenIds;
        mapping(uint256 => uint256) idIndex;
        mapping(uint256 => uint256) amount;
        uint256[] productIds;
        mapping(uint256 => uint256) productIdIndex;
        uint256[] trackerIds;
        mapping(uint256 => uint256) trackerIndex;
        mapping(uint256 => ProductsTracked) productsTracked;
    }
    /**
     * @dev ProductDetails
     * trackerId
     * auditor of the product
     * amount - amount of product
     * available - amount of product available
     * auditor - address that submited the unit amount
     **/
    struct ProductDetails {
        uint256 trackerId;
        address auditor;
        uint256 amount;
        uint256 available;
        // TO-DO : should unitAmount and unit be stored offline to retain product privacy.
        string name;
        string unit;
        string unitAmount;
    }
    /**
     * @dev ProductsTracked
     * productIds - tracked
     * productIndex - of productId tracked
     * amount - of productId tracked
     **/
    struct ProductsTracked {
        uint256[] productIds;
        mapping(uint256 => uint256) productIndex;
        mapping(uint256 => uint256) amount;
    }

    mapping(uint256 => CarbonTrackerDetails) internal _trackerData; //this could be public
    mapping(uint256 => CarbonTrackerMappings) internal _trackerMappings; //this could be public
    mapping(uint256 => ProductDetails) public _productData;

    Counters.Counter public _numOfUniqueTrackers;
    Counters.Counter public _numOfProducts;
    mapping(uint256 => uint256) lockedAmount; //amount of tokenId locked into the contract.
    // map productBalance from productId => address => amount of product owned of holder
    mapping(uint256 => mapping(address => uint256)) public productBalance;
    // map approved auditors to trackee
    mapping(address => mapping(address => bool)) isAuditorApproved;
    // map trackee to boolean enforcing isAuditorApproved in isAuditor modifier
    mapping(address => bool) approvedAuditorsOnly;

    uint256 public decimalsEf; // decimals for emission factor calculations

    event RegisteredTracker(address indexed account);

    event TrackerUpdated(
        uint256 indexed trackerId,
        address indexed tracker,
        uint256[] tokenIds,
        uint256[] tokenAmounts
    );
    event ProductsUpdated(
        uint256 indexed trackerId,
        uint256[] productIds,
        uint256[] productAmounts
    );
    event VerifierApproved(address indexed auditor, address indexed trackee);
    event VerifierRemoved(address indexed auditor, address indexed trackee);

    constructor(address _net, address _admin) ERC721("", "") {
        net = NetEmissionsTokenNetwork(_net);
        netAddress = _net;
        decimalsEf = 1000000;
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        _setupRole(REGISTERED_TRACKER, _admin);
    }

    modifier notAudited(uint256 trackerId) {
        require(
            _trackerData[trackerId].auditor == address(0),
            "CLM8::notAudited: trackerId is already audited"
        );
        _;
    }
    modifier isAuditor(uint256 trackerId) {
        _isAuditor(_trackerData[trackerId].trackee);
        _;
    }

    /**
     * @dev check if msg.sender is authorized aufitor of _trackee.
     * @param _trackee - account being audited
     */
    function _isAuditor(address _trackee) internal view {
        require(
            __isAuditor(_trackee),
            "CLM8::_isAuditor: _trackee is not an approved auditor of the trackee"
        );
    }

    function __isAuditor(address _trackee) internal view returns (bool) {
        return
            (net.isAuditor(msg.sender) || msg.sender == netAddress) &&
            (// require isAuditorApproved?
            (approvedAuditorsOnly[_trackee] &&
                isAuditorApproved[msg.sender][_trackee]) ||
                // otherwise don't require preapproval of auditors
                !approvedAuditorsOnly[_trackee]);
    }

    modifier isAudited(uint256 trackerId) {
        _isAudited(trackerId);
        _;
    }

    function _isAudited(uint256 trackerId) internal view {
        require(
            _trackerData[trackerId].auditor != address(0),
            "CLM8::_isAudited: trackerId is not audited"
        );
    }

    modifier isOwner(uint256 trackerId) {
        _isOwner(trackerId, msg.sender);
        _;
    }

    function _isOwner(uint256 trackerId, address owner) internal view {
        require(
            super.ownerOf(trackerId) == owner,
            "CLM8::_isOwner: msg.sender does not own this trackerId"
        );
    }

    function _isAuditorOrOwner(uint256 trackerId, address _address)
        internal
        view
    {
        require(
            __isAuditor(_address) || super.ownerOf(trackerId) == _address,
            "CLM8::_isOwner: msg.sender is not the auditor of or does not own this trackerId"
        );
    }

    modifier trackerExists(uint256 trackeID) {
        _trackerExists(trackeID);
        _;
    }

    function _trackerExists(uint256 trackeID) internal view {
        require(
            _numOfUniqueTrackers.current() >= trackeID,
            "CLM8::_trackerExists: tracker token ID does not exist"
        );
    }

    modifier registeredTracker(address trackee) {
        require(
            hasRole(REGISTERED_TRACKER, trackee),
            "CLM8::registeredTracker: the address is not registered"
        );
        _;
    }
    modifier isIndustry(address industry) {
        require(
            net.isIndustry(industry),
            "CLM8::registeredIndustry: the address is not registered"
        );
        _;
    }
    modifier trackeeIsIndustry(uint256 trackerId) {
        require(
            net.isIndustry(_trackerData[trackerId].trackee),
            "CLM8::registeredIndustry: the address is not registered"
        );
        _;
    }
    modifier onlyAdmin() {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "CLM8::onlyAdmin: msg.sender is not an admin"
        );
        _;
    }

    /**
     * @dev require msg.sender has admin role
     */
    modifier selfOrAuditor(address _address) {
        require(
            _address == msg.sender ||
                net.hasRole(net.REGISTERED_EMISSIONS_AUDITOR(), msg.sender),
            "CLM8::selfOrAuditor: msg.sender does not own this address or is not an auditor"
        );
        _;
    }

    function _verifyTotalTracked(uint256 outAmount, uint256 totalTracked)
        public
        pure
    {
        require(
            outAmount >= totalTracked,
            "CLM8::_verifyTotalTracked: total amount tracked exceeds output of tokenId from trackerId"
        );
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, ERC1155Receiver, AccessControl)
        returns (bool)
    {
        return
            interfaceId == type(IAccessControl).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @dev initialize a tracker Token for trackee. Any address can initilize a tracker. However, only auditors can initialize a tracker with emission tokens
     * @param trackee - address of the registered industry of the trackee
     * @param issuedTo - address that the tracker is ussed to (if different from the trackee address)
     * @param tokenIds - array of ids of tracked tokens from NET (direct/indirect/offsets)
     * @param tokenAmounts - array of incoming token id amounts (direct/indirect/offsets) matching each carbon token
     * @param fromDate - start date of tracker
     * @param thruDate - end date of tracker
     */
    function track(
        address issuedTo,
        address trackee,
        uint256[] memory tokenIds,
        uint256[] memory tokenAmounts,
        uint256 fromDate,
        uint256 thruDate,
        string memory description,
        string memory metadata
    ) public {
        CarbonTrackerDetails storage trackerData = _track(trackee);
        super._mint(issuedTo, trackerData.trackerId);

        if (fromDate > 0) {
            trackerData.fromDate = fromDate;
        }
        if (thruDate > 0) {
            trackerData.thruDate = thruDate;
        }
        if (bytes(description).length > 0) {
            trackerData.description = description;
        }
        if (bytes(metadata).length > 0) {
            trackerData.metadata = metadata;
        }
        // add tokens if provided
        if (tokenIds.length > 0) {
            return _trackTokens(trackerData, tokenIds, tokenAmounts);
        }
    }

    /**
     * @dev update a tracker Token
     * @param trackerId of the token
     * see tracker() function for description of other inputs
     **/
    function trackUpdate(
        uint256 trackerId,
        uint256[] memory tokenIds,
        uint256[] memory tokenAmounts,
        uint256 fromDate,
        uint256 thruDate,
        string memory description,
        string memory metadata
    ) public notAudited(trackerId) trackerExists(trackerId) {
        CarbonTrackerDetails storage trackerData = _trackerData[trackerId];
        trackerData.dateUpdated = block.timestamp;
        if (fromDate > 0) {
            trackerData.fromDate = fromDate;
        }
        if (thruDate > 0) {
            trackerData.thruDate = thruDate;
        }
        if (bytes(description).length > 0) {
            trackerData.description = description;
        }
        if (bytes(metadata).length > 0) {
            trackerData.metadata = metadata;
        }
        return _trackTokens(trackerData, tokenIds, tokenAmounts);
    }

    /**
     * @dev create tracker
     * @param trackee - industry producing products with embobied emisssions
     **/
    function _track(address trackee)
        internal
        returns (
            //isIndustry(trackee) // limit new tracker to industry addresses
            CarbonTrackerDetails storage
        )
    {
        // increment trackerId
        _numOfUniqueTrackers.increment();
        uint256 trackerId = _numOfUniqueTrackers.current();
        // create token details
        CarbonTrackerDetails storage trackerData = _trackerData[trackerId];
        trackerData.trackerId = trackerId;
        trackerData.createdBy = msg.sender;
        trackerData.trackee = trackee;
        trackerData.dateCreated = block.timestamp;
        return trackerData;
    }

    /**
     * @dev updated token data assinged to tracker
     * used by track() and trackerUpdate()
     **/
    function _trackTokens(
        CarbonTrackerDetails storage trackerData,
        uint256[] memory tokenIds,
        uint256[] memory tokenAmounts
    ) internal trackeeIsIndustry(trackerData.trackerId) {
        _isAuditor(trackerData.trackee);
        require(
            tokenAmounts.length == tokenIds.length,
            "CLM8::_trackTokens: tokenAmounts and tokenIds are not the same length"
        );
        // create trcker Mappings to store tokens (and product) info
        CarbonTrackerMappings storage trackerMappings = _trackerMappings[
            trackerData.trackerId
        ];

        for (uint256 i = 0; i < tokenIds.length; i++) {
            (uint256 avail, ) = net.getAvailableAndRetired(
                address(this),
                tokenIds[i]
            );
            require(
                msg.sender == netAddress ||
                    avail.sub(lockedAmount[tokenIds[i]]) >= tokenAmounts[i],
                "CLM8::_trackTokens: tokenAmounts[i] is greater than what is available to the tracker contract"
            );
            lockedAmount[tokenIds[i]] = lockedAmount[tokenIds[i]].add(
                tokenAmounts[i]
            );
            uint256 index = trackerMappings.idIndex[tokenIds[i]];
            uint8 tokenTypeId = net.getTokenTypeId(tokenIds[i]);
            _addTokenAmounts(
                trackerMappings,
                tokenIds[i],
                tokenAmounts[i],
                index,
                tokenTypeId
            );
        }
        emit TrackerUpdated(
            trackerData.trackerId,
            msg.sender,
            tokenIds,
            tokenAmounts
        );
    }

    /**
     * @dev add to (or update) products tied to a tracker
     * @param trackerId of the token
     * @param productIds (if set to 0 will create a new product)
     * @param productAmounts - normalized units of each product for weighted distirbution of the tracker totalEmissions
     * @param productUnits - physical units of each product
     * @param productUnitAmounts - amount of product in the physical units
     * see tracker() function for description of other inputs
     **/
    function productsUpdate(
        uint256 trackerId,
        uint256[] memory productIds,
        uint256[] memory productAmounts,
        string[] memory productNames,
        string[] memory productUnits,
        string[] memory productUnitAmounts
    )
        public
        notAudited(trackerId)
        trackerExists(trackerId)
        isAuditor(trackerId)
    {
        CarbonTrackerDetails storage trackerData = _trackerData[trackerId];
        require(
            productAmounts.length == productIds.length,
            "CLM8::productsUpdate: productAmounts and productIds are not the same length"
        );
        // TO-DO the followoing input paramters should not be sent to the contract to presever producer privacy.
        // see ProductDetails _productData mapping
        require(
            productNames.length == productIds.length,
            "CLM8::productsUpdate: productNames and productIds are not the same length"
        );
        require(
            productUnitAmounts.length == productIds.length,
            "CLM8::productsUpdate: productUnitAmounts and productIds are not the same length"
        );
        require(
            productUnits.length == productIds.length,
            "CLM8::productsUpdate: productUnitAmounts and productIds are not the same length"
        );

        uint256 productId;
        for (uint256 i = 0; i < productIds.length; i++) {
            if (productIds[i] > 0) {
                productId = productIds[i];
                require(
                    _productData[productId].trackerId == trackerId,
                    "CLM8::productsUpdate: productIds[i] does not belong to trackerId"
                );

                trackerData.totalProductAmounts = trackerData
                    .totalProductAmounts
                    .sub(productAmounts[i]);
                require(
                    _productData[productId].auditor == msg.sender,
                    "CLM8::productsUpdate: msg.sender is not the auditor of this product"
                );
            } else {
                _numOfProducts.increment();
                productId = _numOfProducts.current();
                _productData[productId].trackerId = trackerId;
                _productData[productId].auditor = msg.sender;
                _trackerMappings[trackerId].productIds.push(productId);
            }
            _productData[productId].name = productNames[i];
            _productData[productId].unitAmount = productUnitAmounts[i];
            _productData[productId].unit = productUnits[i];
            _productData[productId].amount = productAmounts[i];
            _productData[productId].available = productAmounts[i];
            trackerData.totalProductAmounts = trackerData
                .totalProductAmounts
                .add(productAmounts[i]);
        }
        emit ProductsUpdated(trackerData.trackerId, productIds, productAmounts);
    }

    /**
     * @dev send a product to a trackee's address
     * Products are first transferred to a trackee
     * It is trackee's task to assign the product to a new tracker.
     * Will first transfer amount of product available to owner of tracker token (if owner is msg.sender)
     * The rest is transferred from the msg.sender productBalance
     **/
    function transferProduct(
        uint256 productId,
        uint256 productAmount,
        address trackee
    )
        public
    //isIndustry(trackee) // TO-DO: limit to addresses registered as industry with NET
    {
        ProductDetails storage product = _productData[productId];

        uint256 available;
        if (msg.sender == super.ownerOf(product.trackerId)) {
            _isAudited(product.trackerId);
            available = product.available;
        }

        uint256 total = productBalance[productId][msg.sender].add(available);
        require(
            total > productAmount,
            "CLM8::transferProduct: productAmount exceeds product available in sourceTrackerId"
        );

        // residual amount of product to transfer after first sending amount to owner of tracker token
        uint256 residualAmount;
        if (available > 0) {
            if (productAmount > available) {
                residualAmount = productAmount - available;
                product.available = 0;
            } else {
                product.available = product.available.sub(productAmount);
            }
        } else {
            residualAmount = productAmount;
        }
        if (residualAmount > 0) {
            productBalance[productId][msg.sender] = productBalance[productId][
                msg.sender
            ].sub(residualAmount);
        }
        // update product balance of trackee
        productBalance[productId][trackee] = productBalance[productId][trackee]
            .add(productAmount);
    }

    /**
     * @dev track a product to an new trackerId
     * in this function the owner of trackerId, or an auditor, assigns products received from other carbon tracker tokens
     **/
    function trackProduct(
        uint256 trackerId,
        uint256 sourceTrackerId,
        uint256 productId,
        uint256 productAmount
    ) public notAudited(trackerId) {
        _trackerExists(trackerId);
        _isAuditorOrOwner(trackerId, msg.sender);
        //require(productAmounts.length == productIds.length,
        //    "CLM8::sendProducts: productAmounts and productIds are not the same length");
        require(
            trackerId != _productData[productId].trackerId,
            "CLM8::trackProduct: product's trackerId can not be the same as the trackerId"
        );
        //for (uint i = 0; i < productIds.length; i++) { }
        require(
            productBalance[productId][msg.sender] > productAmount,
            "CLM8::trackProduct: productAmount exceeds products available for transfer"
        );
        productBalance[productId][msg.sender] = productBalance[productId][
            msg.sender
        ].sub(productAmount);
        return
            _updateTrackedProducts(
                trackerId,
                sourceTrackerId,
                productId,
                productAmount
            );
    }

    /**
     * @dev update the token data within the Tracker
     * @param tokenId to be updated
     * @param tokenData to be updated
     * @param amountAdd - amount of token to add
     * @param index - index of current tokenId
     * @param tokenTypeId
     **/
    function _addTokenAmounts(
        CarbonTrackerMappings storage tokenData,
        uint256 tokenId,
        uint256 amountAdd,
        uint256 index,
        uint256 tokenTypeId
    ) internal {
        //AEC are not used by the tracker contract
        if (tokenTypeId == 4) {
            tokenData.amount[tokenId] = tokenData.amount[tokenId].add(
                amountAdd
            );
        } else if (tokenTypeId == 2) {
            tokenData.amount[tokenId] = tokenData.amount[tokenId].sub(
                amountAdd
            );
        } // REC does not change the total emissions

        if (tokenData.amount[tokenId] > 0) {
            // if the final amount is not zero check if the tokenId should be
            // added to the tokenIds array and update idAmount
            if (index == 0) {
                tokenData.tokenIds.push(tokenId);
                tokenData.idIndex[tokenId] = tokenData.tokenIds.length;
            }
        }
    }

    /*
    function _subTokenAmounts(uint tokenId, CarbonTrackerMappings storage tokenData, 
        uint total, 
        uint amountSub,
        uint index,
        uint tokenTypeId
        ) internal returns(uint){
        if(tokenTypeId>2){
            total = total.sub(amountSub);
            tokenData.amount[tokenId] = tokenData.amount[tokenId].sub(amountSub);
        }else if(tokenTypeId==2){
            total = total.add(amountSub);
            tokenData.amount[tokenId] = tokenData.amount[tokenId].add(amountSub);
        }// REC does not change the total emissions

        if(tokenData.amount[tokenId]==0){
            // remove tokenId and associated data from tracker
            if (tokenData.tokenIds.length > 1) {
                tokenData.tokenIds[index-1] = 
                    tokenData.tokenIds[tokenData.tokenIds.length-1];
                tokenData.idIndex[tokenData.tokenIds[index-1]]=index;
            }
            // index of tokenId should be deleted;
            delete tokenData.idIndex[tokenId];
            delete tokenData.amount[tokenId];
            delete tokenData.tokenIds[tokenData.tokenIds.length-1];
        }
        return total;
    }*/
    /**
     * @dev update the product info within the Tacker
     **/
    function _updateTrackedProducts(
        uint256 trackerId,
        uint256 sourceTrackerId,
        uint256 productId,
        uint256 productAmount
    ) internal {
        CarbonTrackerMappings storage trackerMappings = _trackerMappings[
            trackerId
        ];
        ProductsTracked storage productsTracked = trackerMappings
            .productsTracked[sourceTrackerId];
        productsTracked.amount[productId] = productsTracked
            .amount[productId]
            .add(productAmount);

        uint256 trackerIndex = trackerMappings.trackerIndex[sourceTrackerId];
        uint256 productIndex = productsTracked.productIndex[productId];

        if (productsTracked.amount[productId] > 0) {
            // if there are tracked tokenIds
            if (productIndex == 0) {
                // if the productId is not indexed (default is 0)
                productsTracked.productIds.push(productId);
                productsTracked.productIndex[productId] = productsTracked
                    .productIds
                    .length;
            }
        } else {
            if (productIndex > 0) {
                // if product has index drop from array
                if (productsTracked.productIds.length > 1) {
                    productsTracked.productIds[
                        productIndex - 1
                    ] = productsTracked.productIds[
                        productsTracked.productIds.length - 1
                    ];
                    productsTracked.productIndex[
                        productsTracked.productIds[productIndex - 1]
                    ] = productIndex;
                }
                delete productsTracked.productIndex[productId];
                delete productsTracked.productIds[
                    productsTracked.productIds.length - 1
                ];
            }
            // and finally delete productsTracked data
            delete productsTracked.amount[productId];
        }
        if (productsTracked.productIds.length > 0) {
            // if there are productIds update trackerIds and trackerIndex
            if (trackerIndex == 0) {
                // if the sourceTrackerId is not indexed (default is 0) push it to trackerIds
                trackerMappings.trackerIds.push(sourceTrackerId);
                trackerMappings.trackerIndex[sourceTrackerId] = trackerMappings
                    .trackerIds
                    .length;
            }
        } else {
            // if there are no tracked products drop trackerIds and trackerIndex
            if (trackerIndex > 0) {
                // remove sourceTrackerId from array, update indexing
                if (trackerMappings.trackerIds.length > 1) {
                    trackerMappings.trackerIds[
                        trackerIndex - 1
                    ] = trackerMappings.trackerIds[
                        trackerMappings.trackerIds.length - 1
                    ];
                    trackerMappings.trackerIndex[
                        trackerMappings.trackerIds[trackerIndex - 1]
                    ] = trackerIndex;
                }
                delete trackerMappings.trackerIndex[sourceTrackerId];
                delete trackerMappings.trackerIds[
                    trackerMappings.trackerIds.length - 1
                ];
            }
            // and finally delete productsTracked data
            delete trackerMappings.productsTracked[sourceTrackerId];
        }
    }

    /**
     * sign the contract as audited
     **/
    function audit(uint256 trackerId)
        public
        notAudited(trackerId)
        isAuditor(trackerId)
    {
        _trackerData[trackerId].auditor = msg.sender;
    }

    function removeAudit(uint256 trackerId) public isAuditor(trackerId) {
        delete _trackerData[trackerId].auditor;
    }

    /**
     * @dev msg.sender can volunteer themselves as registered tracker or admin
     */
    function registerTracker(address tracker) external selfOrAuditor(tracker) {
        _setupRole(REGISTERED_TRACKER, tracker);
        emit RegisteredTracker(tracker);
    }

    /**
     * @dev approve verifier for trackee as msg.sender
     * @param verifier to be approved or removed
     * @param approve (true) or remove (false)
     */
    function approveVerifier(address verifier, bool approve)
        external
        registeredTracker(msg.sender)
    {
        require(
            net.isAuditor(verifier) || !approve,
            "CLM8::approveVerifier: address is not a registered emissions auditor"
        );
        require(
            verifier != msg.sender,
            "CLM8::approveVerifier: auditor cannot be msg.sender"
        );
        isAuditorApproved[verifier][msg.sender] = approve;
        if (approve) {
            emit VerifierApproved(verifier, msg.sender);
        } else {
            emit VerifierRemoved(verifier, msg.sender);
        }
    }

    /** 
 Below are public view functions
**/

    /**
     * Divides total emissions by product amount to get the emissions factor of the tracker
     * Warning: should never be called within functions that update the network to avoid excessive gas fees
     */
    function emissionsFactor(uint256 trackerId) public view returns (uint256) {
        CarbonTrackerDetails storage trackerData = _trackerData[trackerId];
        if (trackerData.totalProductAmounts > 0) {
            return (
                getTotalEmissions(trackerId).mul(decimalsEf).div(
                    trackerData.totalProductAmounts
                )
            );
        } else {
            return (0);
        }
    }

    /**
     * @dev Returns `true` if uint signature is valid
     *
     * Note, to avoid exposing if a unit matches a signature
     * avoid sending this public funciton call to an unkown server that might store the funciton attribtues
     * (public functions are not broadcast to the EVM or blockchain network)
     */
    function verifyUnitSignature(
        uint256 trackerId,
        uint256 productId,
        string memory unit,
        string memory unitAmount,
        bytes memory signature
    ) public view isAudited(trackerId) trackerExists(trackerId) returns (bool) {
        address signer = _productData[productId].auditor;
        bytes32 ethSignedUnitHash = _getUnitHash(
            trackerId,
            productId,
            unit,
            unitAmount
        ).toEthSignedMessageHash();
        return ethSignedUnitHash.recover(signature) == signer;
    }

    /**
     * @dev Returns keccak256 hash of text for a trackerId and productId pair
     * This function should be called by the auditor submitting product data
     * to produce a unitHash that is signed off-chain.
     * The signature can be provided to accounts requesting products
     * to verify the unit associated with product amounts
     * unit data is not stored on-chain to respect producer privacy
     */
    function _getUnitHash(
        uint256 trackerId,
        uint256 productId,
        string memory unit,
        string memory unitAmount
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    address(this),
                    trackerId,
                    productId,
                    unit,
                    unitAmount
                )
            );
    }

    /**
     * @dev returns total emissions of the tracker from its emissions network tokens
     */
    function getTotalEmissions(uint256 trackerId)
        public
        view
        returns (uint256)
    {
        //CarbonTrackerDetails storage trackerData = _trackerData[trackerId];
        CarbonTrackerMappings storage trackerMappings = _trackerMappings[
            trackerId
        ];
        uint256 totalEmissions = _getTotalEmissions(trackerMappings);
        return totalEmissions;
    }

    function _getTotalEmissions(CarbonTrackerMappings storage trackerMappings)
        internal
        view
        returns (uint256)
    {
        uint256[] storage tokenIds = trackerMappings.tokenIds;
        uint256 totalEmissions;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            totalEmissions = totalEmissions.add(
                trackerMappings.amount[tokenIds[i]]
            );
        }
        uint256[] memory productIds;

        uint256[] memory trackerIds = trackerMappings.trackerIds;
        ProductsTracked storage productsTracked;
        for (uint256 i = 0; i < trackerIds.length; i++) {
            productsTracked = trackerMappings.productsTracked[trackerIds[i]];
            productIds = productsTracked.productIds;
            uint256 productAmount;
            for (uint256 j = 0; j < productIds.length; j++) {
                productAmount = productsTracked.amount[productIds[j]];
                totalEmissions = totalEmissions.add(
                    productAmount.mul(emissionsFactor(trackerIds[i])).div(
                        decimalsEf
                    )
                );
            }
        }
        return totalEmissions;
    }

    function getProductBalance(uint256 productId, address owner)
        public
        view
        returns (uint256)
    {
        // add what is available form product Tracker ID
        if (owner == super.ownerOf(_productData[productId].trackerId)) {
            return
                productBalance[productId][owner].add(
                    _productData[productId].available
                );
        }
        return productBalance[productId][owner];
    }

    /**
     * @dev returns number of unique trackers
     */
    function getNumOfUniqueTrackers() public view returns (uint256) {
        return _numOfUniqueTrackers.current();
    }

    /**
     * @dev returns the details of a given trackerId
     */
    function getTrackerDetails(uint256 trackerId)
        public
        view
        returns (
            CarbonTrackerDetails memory,
            uint256,
            uint256[] memory
        )
    {
        CarbonTrackerDetails storage trackerData = _trackerData[trackerId];
        CarbonTrackerMappings storage trackerMappings = _trackerMappings[
            trackerId
        ];
        uint256[] storage productIds = trackerMappings.productIds;
        uint256 totalEmissions = _getTotalEmissions(trackerMappings);
        return (trackerData, totalEmissions, productIds);
    }

    function getProductDetails(uint256 productId)
        public
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        ProductDetails memory product = _productData[productId];
        return (product.trackerId, product.amount, product.available);
    }

    function getTrackerTokenDetails(uint256 trackerId)
        public
        view
        returns (uint256[] memory, uint256[] memory)
    {
        CarbonTrackerMappings storage trackerMappings = _trackerMappings[
            trackerId
        ];
        uint256[] memory tokenIds = trackerMappings.tokenIds;
        uint256[] memory tokenAmounts = new uint256[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            tokenAmounts[i] = trackerMappings.amount[tokenIds[i]];
        }
        return (tokenIds, tokenAmounts);
    }

    /**
     * @dev returns number of unique trackers
     */
    function getNumOfProducts() public view returns (uint256) {
        return _numOfProducts.current();
    }

    function getTrackerIds(uint256 trackerId)
        public
        view
        returns (uint256[] memory)
    {
        return (_trackerMappings[trackerId].trackerIds);
    }

    function getTokenIds(uint256 trackerId)
        public
        view
        returns (uint256[] memory)
    {
        return (_trackerMappings[trackerId].tokenIds);
    }

    function getTokenAmounts(uint256 trackerId)
        public
        view
        returns (uint256[] memory, uint256[] memory)
    {
        CarbonTrackerMappings storage trackerMappings = _trackerMappings[
            trackerId
        ];
        uint256[] memory tokenIds = trackerMappings.tokenIds;
        uint256[] memory tokenAmounts = new uint256[](tokenIds.length);
        for (uint256 j = 0; j < tokenIds.length; j++) {
            tokenAmounts[j] = trackerMappings.amount[tokenIds[j]];
        }
        return (tokenIds, tokenAmounts);
    }
}
