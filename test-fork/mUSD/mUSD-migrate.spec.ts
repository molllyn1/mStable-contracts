import { expect } from "chai"
import { Contract, ContractFactory, Signer } from "ethers"
import { ethers, network } from "hardhat"

import { ONE_DAY, ONE_WEEK, DEAD_ADDRESS } from "@utils/constants"
import { applyDecimals, applyRatioMassetToBasset, BN, simpleToExactAmount } from "@utils/math"
import {
    DelayedProxyAdmin,
    DelayedProxyAdmin__factory,
    ERC20__factory,
    Masset,
    MusdV3,
    MusdV3__factory,
    MusdV3Rebalance__factory,
    MusdV3Rebalance,
    AaveV2Integration,
} from "types/generated"
import { MusdV3LibraryAddresses } from "types/generated/factories/MusdV3__factory"
import { BassetStatus } from "@utils/mstable-objects"
import { increaseTime } from "@utils/time"
import { assertBNClosePercent } from "@utils/assertions"

import { formatUnits } from "ethers/lib/utils"

import { abi as MusdV2Abi, bytecode as MusdV2Bytecode } from "./MassetV2.json"
import { abi as BasketManagerV2Abi, bytecode as BasketManagerV2Bytecode } from "./BasketManagerV2.json"
import { abi as SavingsManagerAbi, bytecode as SavingsManagerBytecode } from "./SavingsManager.json"

// Accounts that are impersonated
const deployerAddress = "0x19F12C947D25Ff8a3b748829D8001cA09a28D46d"
const ethWhaleAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
const mUsdWhaleAddress = "0x6595732468A241312bc307F327bA0D64F02b3c20"
const daiWhaleAddress = "0xdb2C46Ed8E850668b942d9Bd6D2ae8803c6789DF"

// Mainnet contract addresses
const validatorAddress = "0xCa480D596e6717C95a62a4DC1bD4fbD7b7E7d705"
const mUsdV3Address = "0x15B2838Cd28cc353Afbe59385db3F366D8945AEe"
const mUsdProxyAddress = "0xe2f2a5C287993345a840Db3B0845fbC70f5935a5"
const basketManagerAddress = "0x66126B4aA2a1C07536Ef8E5e8bD4EfDA1FdEA96D"
const nexusAddress = "0xAFcE80b19A8cE13DEc0739a1aaB7A028d6845Eb3"
const delayedProxyAdminAddress = "0x5C8eb57b44C1c6391fC7a8A0cf44d26896f92386"
const governorAddress = "0xF6FF1F7FCEB2cE6d26687EaaB5988b445d0b94a2"
const aaveCoreV1Address = "0x3dfd23A6c5E8BbcFc9581d2E864a68feb6a076d3"
const curveYPoolAddress = "0x45F783CCE6B7FF23B2ab2D70e416cdb7D6055f51"
const curveTusdPoolAddress = "0xEcd5e75AFb02eFa118AF914515D6521aaBd189F1"
const rebalancerAddress = "0x4b53a1E2C0417F95dbf71342De7FeD9EA28cc259"

// Aave V2
const aaveAddress = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5"

const defaultConfig = {
    a: 135,
    limits: {
        min: simpleToExactAmount(5, 16),
        max: simpleToExactAmount(65, 16),
    },
}

const ethUsd = 1800
const gasPriceGwei = 150 // Gwei is 10^9

interface Token {
    index?: number
    symbol: string
    address: string
    integrator: string
    decimals: number
    vaultBalance: BN
    whaleAddress: string
}

const sUSD: Token = {
    symbol: "sUSD",
    address: "0x57Ab1ec28D129707052df4dF418D58a2D46d5f51",
    integrator: "0xf617346A0FB6320e9E578E0C9B2A4588283D9d39", // Aave 1 vault
    decimals: 18,
    vaultBalance: BN.from("80910135777356730215"),
    whaleAddress: "0x49BE88F0fcC3A8393a59d3688480d7D253C37D2A",
}
const USDC: Token = {
    symbol: "USDC",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    integrator: "0xD55684f4369040C12262949Ff78299f2BC9dB735", // Compound Vault
    decimals: 6,
    vaultBalance: BN.from("190649757940"),
    whaleAddress: "0xf977814e90da44bfa03b6295a0616a897441acec", // Binance 8
}
const TUSD: Token = {
    symbol: "TUSD",
    address: "0x0000000000085d4780B73119b644AE5ecd22b376",
    integrator: "0xf617346A0FB6320e9E578E0C9B2A4588283D9d39", // Aave vault
    decimals: 18,
    vaultBalance: BN.from("20372453144590237158484978"),
    whaleAddress: "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE", // Binance
}
const USDT: Token = {
    symbol: "USDT",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    integrator: "0xf617346A0FB6320e9E578E0C9B2A4588283D9d39", // Aave vault
    decimals: 6,
    vaultBalance: BN.from("24761709994543"),
    whaleAddress: "0xf977814e90da44bfa03b6295a0616a897441acec", // Binance 8
}
const DAI: Token = {
    symbol: "DAI",
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    integrator: "0xD55684f4369040C12262949Ff78299f2BC9dB735", // Compound Vault
    decimals: 18,
    vaultBalance: BN.from(0),
    whaleAddress: "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8",
}

// bAssets before changes
const currentBassets: Token[] = [
    {
        index: 0,
        ...sUSD,
    },
    {
        index: 1,
        ...USDC,
    },
    {
        index: 2,
        ...TUSD,
    },
    {
        index: 3,
        ...USDT,
    },
]

const intermediaryBassets: Token[] = [
    {
        index: 0,
        ...sUSD,
    },
    {
        index: 1,
        ...USDC,
    },
    {
        index: 2,
        ...TUSD,
    },
    {
        index: 3,
        ...USDT,
    },
    {
        index: 4,
        ...DAI,
    },
]

// ideal bAssets before upgrade
const finalBassets: Token[] = [
    {
        index: 0,
        ...sUSD,
    },
    {
        index: 1,
        ...USDC,
    },
    {
        index: 1,
        ...DAI,
    },
    {
        index: 3,
        ...USDT,
    },
]

// impersonates a specific account
const impersonate = async (addr): Promise<Signer> => {
    await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [addr],
    })
    return ethers.provider.getSigner(addr)
}

// impersonates all accounts
const impersonateAccounts = async () => {
    // Impersonate mainnet accounts
    const accounts = {
        deployer: await impersonate(deployerAddress),
        governor: await impersonate(governorAddress),
        ethWhale: await impersonate(ethWhaleAddress),
        mUSDWhale: await impersonate(mUsdWhaleAddress),
    }

    // send some Ether to the impersonated multisig contract as it doesn't have Ether
    await accounts.ethWhale.sendTransaction({
        to: governorAddress,
        value: simpleToExactAmount(10),
    })

    return accounts
}

interface DeployedMusdV3 {
    proxy: MusdV3
    impl: MusdV3
}

// Deploys Migrator, pulls Manager address and deploys mUSD implementation
const getMusdv3 = async (deployer: Signer): Promise<DeployedMusdV3> => {
    const linkedAddress: MusdV3LibraryAddresses = {
        __$4ff61640dcfbdf6af5752b96f9de1a9efe$__: "0xda681D409319b1f4122B1402C8B5cD4BaEDF9001", // Migrator library
        __$1a38b0db2bd175b310a9a3f8697d44eb75$__: "0x1E91F826fa8aA4fa4D3F595898AF3A64dd188848", // Masset Manager
    }

    // Point to the mUSD contract using the new V3 interface via the existing mUSD proxy
    const mUsdV3Factory = new MusdV3__factory(linkedAddress, deployer)
    const mUsdV3Proxy = mUsdV3Factory.attach(mUsdProxyAddress)

    // Deploy the new mUSD implementation
    const mUsdV3Impl = mUsdV3Factory.attach(mUsdV3Address)

    return {
        proxy: mUsdV3Proxy,
        impl: mUsdV3Impl,
    }
}

// Test mUSD token storage variables
const validateTokenStorage = async (token: MusdV3 | Masset | Contract, overrideSupply = "45324535157903774527261941") => {
    expect(await token.symbol(), "symbol").to.eq("mUSD")
    expect(await token.name(), "name").to.eq("mStable USD")
    expect(await token.decimals(), "decimals").to.eq(18)
    // some mUSD token holder
    expect(await token.balanceOf("0x5C80E54f903458edD0723e268377f5768C7869d7"), `mUSD balance`).to.eq("6971708003000000000000")
    assertBNClosePercent(await token.totalSupply(), BN.from(overrideSupply), "0.1")
}

// Test the existing Masset V2 storage variables
const validateUnchangedMassetStorage = async (mUsd: MusdV3 | Masset | Contract, overrideSurplus = "358648087000000000001") => {
    expect(await mUsd.swapFee(), "swap fee").to.eq(simpleToExactAmount(6, 14))
    expect(await mUsd.redemptionFee(), "redemption fee").to.eq(simpleToExactAmount(3, 14))
    expect(await mUsd.cacheSize(), "cache size").to.eq(simpleToExactAmount(3, 16))
    expect(await mUsd.surplus(), "surplus").to.eq(overrideSurplus)
    expect(await mUsd.nexus(), "nexus").to.eq(nexusAddress)
}

// Check that the bAsset data is what we expect
const validateBasset = (bAssets, i: number, expectToken: Token, expectVaultBalances?: BN[]) => {
    if (!expectVaultBalances) {
        /* eslint-disable-next-line no-param-reassign */
        expectVaultBalances = currentBassets.map((token) => token.vaultBalance)
    }
    expect(bAssets.personal[i].addr, `${expectToken.symbol} address`).to.eq(expectToken.address)
    expect(bAssets.personal[i].integrator, `${expectToken.symbol} integrator`).to.eq(expectToken.integrator)
    expect(bAssets.personal[i].hasTxFee, `${expectToken.symbol} hasTxFee`).to.be.false
    expect(bAssets.personal[i].status, `${expectToken.symbol} status`).to.eq(BassetStatus.Normal)
    expect(bAssets.data[i].ratio, `${expectToken.symbol} ratio`).to.eq(simpleToExactAmount(1, 8 + (18 - expectToken.decimals)))
    expect(bAssets.data[i].vaultBalance, `${expectToken.symbol} vault`).to.eq(expectVaultBalances[i])
}

// Test the new Masset V3 storage variables
const validateNewMassetStorage = async (mUsd: MusdV3 | Masset, validator: string, expectVaultBalances?: BN[]) => {
    expect(await mUsd.forgeValidator(), "forge validator").to.eq(validator)
    expect(await mUsd.maxBassets(), "maxBassets").to.eq(10)

    // bAsset personal data
    const bAssets = await mUsd.getBassets()
    await Promise.all(
        finalBassets.map(async (token, i) => {
            validateBasset(bAssets, i, token, expectVaultBalances)
            expect(await mUsd.bAssetIndexes(token.address)).eq(i)
            const bAsset = await mUsd.getBasset(token.address)
            expect(bAsset[0][0]).eq(token.address)
        }),
    )

    // Get basket state
    const basketState = await mUsd.basket()
    expect(basketState.undergoingRecol, "undergoingRecol").to.be.true
    expect(basketState[0], "basketState[0]").to.be.true
    expect(basketState.failed, "undergoingRecol").to.be.false
    expect(basketState[1], "basketState[1]").to.be.false

    const invariantConfig = await mUsd.getConfig()
    expect(invariantConfig.a, "amplification coefficient (A)").to.eq(defaultConfig.a * 100)
    expect(invariantConfig.limits.min, "min limit").to.eq(defaultConfig.limits.min)
    expect(invariantConfig.limits.max, "max limit").to.eq(defaultConfig.limits.max)
}

// Swaps two tokens in an attempted rebalance
const balanceBasset = async (
    mUsdV2: Contract,
    scaledVaultBalances: BN[],
    scaledTargetBalance: BN,
    inputToken: Token,
    outputToken: Token,
): Promise<void> => {
    const { whaleAddress } = inputToken
    const signer = await impersonate(whaleAddress)
    // scaled target weight - input scaled balance
    const inputDiffToTarget = scaledTargetBalance.sub(scaledVaultBalances[inputToken.index])
    // output scaled balance - scaled target weight
    // If output is TUSD then simply set the baseline to 0
    /* eslint-disable-next-line no-param-reassign */
    scaledTargetBalance = outputToken.symbol === "TUSD" ? BN.from(0) : scaledTargetBalance
    const outputDiffToTarget = scaledVaultBalances[outputToken.index].sub(scaledTargetBalance)
    const minBassetAmount = inputDiffToTarget.lt(outputDiffToTarget) ? inputDiffToTarget : outputDiffToTarget
    if (minBassetAmount.lt(0)) return
    const bAssetAmount = applyRatioMassetToBasset(minBassetAmount, BN.from(10).pow(26 - inputToken.decimals))

    // Check the whale has enough input tokens
    const inputTokenContract = new ERC20__factory(signer).attach(inputToken.address)
    const whaleBalance = await inputTokenContract.balanceOf(whaleAddress)
    expect(whaleBalance, `Whale ${inputToken.symbol} balance`).to.gte(bAssetAmount)
    // whale approves input tokens
    await inputTokenContract.approve(mUsdV2.address, whaleAddress)

    const tx = mUsdV2.connect(signer).swap(inputToken.address, outputToken.address, bAssetAmount, whaleAddress)

    await expect(tx).to.emit(mUsdV2, "Swapped")
    /* eslint-disable-next-line no-param-reassign */
    scaledVaultBalances[inputToken.index] = scaledVaultBalances[inputToken.index].add(minBassetAmount)
    // this is not 100% accurate as the outputs are less fees but it's close enough for testing
    /* eslint-disable-next-line no-param-reassign */
    scaledVaultBalances[outputToken.index] = scaledVaultBalances[outputToken.index].sub(minBassetAmount)
}

const validateFlashLoan = async (
    flashToken: Token,
    basketManager: Contract,
    mUsdRebalance: MusdV3Rebalance,
    scaledTargetBalance: BN,
    overweightTokenSplits: BN[], // TUSD and USDC proportions in basis points (bps),
    loanPercentage = 100,
): Promise<void> => {
    // Get flash token balance in mUSD to 18 decimal places
    const flashTokenInMusd = await basketManager.getBasset(flashToken.address)
    // flash loan amount = target balance - current balance
    const flashLoanAmount = scaledTargetBalance
        // convert target from 18 to 6 decimals for USDC
        .div(BN.from(10).pow(18 - flashToken.decimals))
        .sub(flashTokenInMusd.vaultBalance)
        // scale down the loan if needed
        .mul(loanPercentage)
        .div(100)
    console.log(
        `${flashToken.symbol} ${formatUnits(flashLoanAmount, flashToken.decimals)} under weight = ${scaledTargetBalance} target - ${
            flashTokenInMusd.vaultBalance
        } vault balance`,
    )

    const swapInputs = [flashLoanAmount.mul(overweightTokenSplits[0]).div(10000), flashLoanAmount.mul(overweightTokenSplits[1]).div(10000)]
    console.log(
        `Flash loan ${formatUnits(flashLoanAmount, flashToken.decimals)} ${flashToken.symbol} for mUSD swaps ${formatUnits(
            swapInputs[0],
            flashToken.decimals,
        )} DAI->TUSD and ${formatUnits(swapInputs[1], flashToken.decimals)} DAI->USDT`,
    )

    /**
     Flash loan USDC or DAI from DyDx
     Swap flash token for TUSD using mUSD
     Swap flash token for USDT using mUSD
     Swap TUSD for flash token using Curve Y pool
     Swap USDT for flash token using Curve 3pool
     Fund the DyDx flash loan shortfall
    */
    const tx = mUsdRebalance.swapOutTusdAndUsdt(flashToken.address, flashLoanAmount, flashToken.whaleAddress, swapInputs)
    await expect(tx).to.emit(mUsdRebalance, "FlashLoan")
    const resolvedTx = await tx
    const receipt = await resolvedTx.wait()

    // Get mUSD swap events
    const musdSwap4TusdEvent = receipt.events.find((e) => e.event === "Swapped" && e.args?.output === TUSD.address)
    if (musdSwap4TusdEvent) {
        console.log(
            `mUSD swap: ${formatUnits(swapInputs[0], flashToken.decimals)} ${flashToken.symbol} -> ${formatUnits(
                musdSwap4TusdEvent?.args?.outputAmount,
                TUSD.decimals,
            )} TUSD`,
        )
    }
    const musdSwap4UsdtEvent = receipt.events.find((e) => e.event === "Swapped" && e.args?.output === USDT.address)
    if (musdSwap4UsdtEvent) {
        console.log(
            `mUSD swap: ${formatUnits(swapInputs[1], flashToken.decimals)} ${flashToken.symbol} -> ${formatUnits(
                musdSwap4UsdtEvent?.args?.outputAmount,
                USDT.decimals,
            )} USDT`,
        )
    }

    // TUSD (18) swapped for USDC (6) or DAI (18)
    const yPoolSwapEvent = receipt.events.find((e) => e.event === "TokenExchangeUnderlying" && e.address === curveYPoolAddress)
    if (yPoolSwapEvent) {
        const swapRate = yPoolSwapEvent?.args?.tokens_bought
            // scale USDC up to TUSD's 18 decimal places
            .mul(BN.from(10).pow(18 - flashToken.decimals))
            .sub(yPoolSwapEvent?.args?.tokens_sold)
            .mul(10000)
            .div(yPoolSwapEvent?.args?.tokens_sold)
        console.log(
            `Curve Y pool swap: ${formatUnits(yPoolSwapEvent?.args?.tokens_sold, TUSD.decimals)} TUSD -> ${formatUnits(
                yPoolSwapEvent?.args?.tokens_bought,
                flashToken.decimals,
            )} ${flashToken.symbol} (${swapRate} bps swap rate)`,
        )
    }

    // TUSD (18) swapped for USDC (6) or DAI (18)
    const tusdPoolSwapEvent = receipt.events.find((e) => e.event === "TokenExchangeUnderlying" && e.address === curveTusdPoolAddress)
    if (tusdPoolSwapEvent) {
        const swapRate = tusdPoolSwapEvent?.args?.tokens_bought
            // scale USDC up to TUSD's 18 decimal places
            .mul(BN.from(10).pow(18 - flashToken.decimals))
            .sub(tusdPoolSwapEvent?.args?.tokens_sold)
            .mul(10000)
            .div(tusdPoolSwapEvent?.args?.tokens_sold)
        console.log(
            `Curve TUSD pool swap: ${formatUnits(tusdPoolSwapEvent?.args?.tokens_sold, TUSD.decimals)} TUSD -> ${formatUnits(
                tusdPoolSwapEvent?.args?.tokens_bought,
                flashToken.decimals,
            )} ${flashToken.symbol} (${swapRate} bps swap rate)`,
        )
    }

    // USDT (6) swapped for USDC (6) or DAI (18)
    const curve3PoolSwapEvent = receipt.events.find((e) => e.event === "TokenExchange")
    if (curve3PoolSwapEvent) {
        const swapRate = curve3PoolSwapEvent?.args?.tokens_bought
            // scale DAI (18) back to USDT's 6 decimal places
            .div(BN.from(10).pow(-6 + flashToken.decimals))
            .sub(curve3PoolSwapEvent?.args?.tokens_sold)
            .mul(10000)
            .div(curve3PoolSwapEvent?.args?.tokens_sold)
        console.log(
            `Curve 3pool swap: ${formatUnits(curve3PoolSwapEvent?.args?.tokens_sold, USDT.decimals)} USDT -> ${formatUnits(
                curve3PoolSwapEvent?.args?.tokens_bought,
                flashToken.decimals,
            )} ${flashToken.symbol} (${swapRate} bps swap rate)`,
        )
    }

    // Get Flash Loan event
    const flashLoanEvent = receipt.events.find((e) => e.event === "FlashLoan" && e.args.flashToken === flashToken.address)
    expect(flashLoanEvent, "no FlashLoan event").to.not.undefined
    console.log(`${flashToken.symbol} shortfall ${formatUnits(flashLoanEvent?.args?.flashLoanShortfall, flashToken.decimals)}`)

    const txUsd = receipt.gasUsed
        .mul(gasPriceGwei)
        .mul(ethUsd)
        .div(BN.from(10).pow(18 - 9))
    console.log(`tx used ${receipt.gasUsed} gas at price ${gasPriceGwei} Gwei (${txUsd} USD)`)
}

/**
 * TESTING mUSD Upgrade
 * ------------------------------
 * Step 1: Deploy contract and propose upgrade to begin the 1 week countdown
 *           1. Deploy Migrator, Manager & InvariantValidator
 *           2. Deploy mUSD & propose upgrade with initialization data
 * Test 1: i) Deployed mUSDV3 contract has been proposed correctly
 *
 * ~~ Wait 6 days ~~
 *
 * Step 2: Achieve equilibrium weights & prep
 *           1. Add DAI to CompoundIntegration
 *           2. Add DAI to the basket
 *           3. Set max weights
 *           4. Collect interest
 *           5. Achieve equilibrium weights
 *             - Ensure it cannot be broken
 *           6. Pause BasketManager & SavingsManager
 *           7. Remove TUSD from basket
 * Test 2: i) Existing storage in BasketManager checks out
 *         ii) State at 2.3
 *         iii) Mostly on 2.4 execution
 *         iv) Final state pre-upgrade (everything in place & paused)
 *
 * Step 3: Upgrade mUSD
 *           1. Accept governance proposal
 *           2. Verify storage & paused
 *           3. Unpause system
 * Test 3: i) Upgrade works as intended
 *         ii) All storage has been added & system is paused
 *         iii) Post-unpause: ensure mint, swap, redeem all work as expected
 *         iv) Collect interest & platform interest work
 *         v) Do some admin operations
 *
 * Data
 * ------------------------------
 * mUSD proxy address: 0xe2f2a5C287993345a840Db3B0845fbC70f5935a5
 * Current implementation: 0xe0d0d052d5b1082e52c6b8422acd23415c3df1c4 & https://github.com/mstable/mStable-contracts/blob/6d935eb8c8797e240a7e9fde7603c90d730608ce/contracts/masset/Masset.sol
 * New implementation: ../../contracts/masset/mUSD/MusdV3.sol
 * Contract diff vs current implementation: https://www.diffchecker.com/QqxVbKxb
 * Contract diff vs Masset.sol: https://www.diffchecker.com/jwpfAgVK
 */
describe("mUSD V2.0 to V3.0", () => {
    let accounts: {
        deployer: Signer
        governor: Signer
        ethWhale: Signer
        mUSDWhale: Signer
    }
    let savingsManager: Contract
    let mUsdV2Factory: ContractFactory
    let mUsdV2: Contract
    let mUsdV3: DeployedMusdV3
    let delayedProxyAdmin: DelayedProxyAdmin
    let deployer: Signer
    let governor: Signer
    const balancedVaultBalances: BN[] = []
    let aaveV2: AaveV2Integration
    let basketManager: Contract
    before("Set-up globals", async () => {
        await network.provider.request({
            method: "hardhat_reset",
            params: [
                {
                    forking: {
                        jsonRpcUrl: process.env.NODE_URL,
                        blockNumber: 12043106,
                    },
                },
            ],
        })
        accounts = await impersonateAccounts()
        deployer = accounts.deployer
        governor = accounts.governor

        // Point to mUSD contract using the old V2 interface via the proxy
        mUsdV2Factory = new ContractFactory(MusdV2Abi, MusdV2Bytecode, deployer)
        mUsdV2 = mUsdV2Factory.attach(mUsdProxyAddress)

        delayedProxyAdmin = new DelayedProxyAdmin__factory(governor).attach(delayedProxyAdminAddress)

        const savingsManagerFactory = new ContractFactory(SavingsManagerAbi, SavingsManagerBytecode, governor)
        savingsManager = savingsManagerFactory.attach("0x9781C4E9B9cc6Ac18405891DF20Ad3566FB6B301")

        const basketManagerFactory = new ContractFactory(BasketManagerV2Abi, BasketManagerV2Bytecode, governor)
        basketManager = basketManagerFactory.attach(basketManagerAddress)
    })
    it("connects to forked V2 via the mUSD proxy", async () => {
        expect(await mUsdV2.getBasketManager(), "basket manager").to.eq(basketManagerAddress)
        await validateTokenStorage(mUsdV2 as Masset)
        await validateUnchangedMassetStorage(mUsdV2 as Masset)
    })
    it("validates delayedProxyAdmin", async () => {
        expect(await delayedProxyAdmin.UPGRADE_DELAY(), "upgrade delay").to.eq(ONE_WEEK)
        expect(await delayedProxyAdmin.getProxyImplementation(mUsdProxyAddress), "delayed proxy admin").to.eq(
            "0xE0d0D052d5B1082E52C6b8422Acd23415c3DF1c4",
        )
        expect(await delayedProxyAdmin.getProxyAdmin(mUsdProxyAddress), "delayed proxy admin").to.eq(delayedProxyAdminAddress)
    })

    /**
     * Step 1: Deploy contract and propose upgrade to begin the 1 week countdown
     *           1. Deploy Migrator & InvariantValidator
     *           2. Deploy mUSD & propose upgrade with initialization data
     * Test 1: i) Deployed mUSDV3 contract has been proposed correctly
     *         ii) Existing storage in BasketManager checks out
     */
    describe("STEP 1: Deploy & propose upgrade", () => {
        it("gets deployed mUSD impl", async () => {
            mUsdV3 = await getMusdv3(deployer)
        })
        it("proposes mUSD upgrade to proxyadmin", async () => {
            const data = await mUsdV3.impl.interface.encodeFunctionData("upgrade", [validatorAddress, defaultConfig])

            const request = await delayedProxyAdmin.requests(mUsdProxyAddress)
            expect(request.data).eq(data)
            expect(request.implementation).eq(mUsdV3.impl.address)
        })
        it("checks nexus address on deployed mUSD", async () => {
            const assignedNexus = await mUsdV3.impl.nexus()
            expect(assignedNexus).eq(nexusAddress)
        })
        it("delays 6 days", async () => {
            await increaseTime(ONE_DAY.mul(6).toNumber())
        })
    })

    /*
     * Step 2: Achieve equilibrium weights & prep
     *           1. Add DAI to CompoundIntegration
     *           2. Add DAI to the basket
     *           3. Set max weights
     *           4. Collect interest
     *           5. Achieve equilibrium weights
     *             - Ensure it cannot be broken
     *           6. Pause BasketManager & SavingsManager
     *           7. Remove TUSD from basket
     * Test 2: i) State at 2.3
     *         ii) Mostly on 2.5 execution
     *         iii) Final state pre-upgrade (everything in place & paused)
     */
    describe("STEP 2 - Achieve equilibrium weights & prep", () => {
        const scaledVaultBalances: BN[] = []
        let scaledTargetBalance: BN
        it("adds DAI to the basket", async () => {
            // 2. Add DAI to basket
            await basketManager.addBasset(DAI.address, DAI.integrator, false)
        })
        it("should get bAssets to check current weights", async () => {
            const { bAssets } = await basketManager.getBassets()
            let scaledTotalVaultBalance = BN.from(0)
            intermediaryBassets.forEach((token, i) => {
                const scaledVaultBalance = applyDecimals(bAssets[i].vaultBalance, token.decimals)
                scaledVaultBalances[i] = scaledVaultBalance
                scaledTotalVaultBalance = scaledTotalVaultBalance.add(scaledVaultBalance)
                expect(bAssets[i].vaultBalance).to.eq(token.vaultBalance)
            })
            scaledTargetBalance = scaledTotalVaultBalance.div(4)
            // Test percentage of basket in basis points. eg 2668 = 26.68%
            expect(scaledVaultBalances[0].mul(10000).div(scaledTotalVaultBalance)).to.eq(0)
            expect(scaledVaultBalances[1].mul(10000).div(scaledTotalVaultBalance)).to.eq(42)
            expect(scaledVaultBalances[2].mul(10000).div(scaledTotalVaultBalance)).to.eq(4494)
            expect(scaledVaultBalances[3].mul(10000).div(scaledTotalVaultBalance)).to.eq(5463)
            expect(scaledVaultBalances[4].mul(10000).div(scaledTotalVaultBalance)).to.eq(0)
        })
        it("should update max weights to 25.01%", async () => {
            // 25.01% where 100% = 1e18
            const maxWeight = simpleToExactAmount(2501, 14)
            await basketManager.setBasketWeights(
                intermediaryBassets.map((token) => token.address),
                [maxWeight, maxWeight, 0, maxWeight, maxWeight],
            )
        })
        it("collects interest one last time", async () => {
            await savingsManager.collectAndDistributeInterest(mUsdV2.address)
        })
        // Step 1. Swap DAI in for TUSD
        // Step 2. Swap sUSD in for else
        // Check: Taking DAI or sUSD out of the basket is not possible once in
        it("should swap DAI for TUSD to balance DAI", async () => {
            await balanceBasset(mUsdV2, scaledVaultBalances, scaledTargetBalance, intermediaryBassets[4], intermediaryBassets[2])
        })
        it("should not be possible to take out the DAI, aside from adding sUSD", async () => {
            // mint not possible with others
            // await expect(mUsdV2.mint(intermediaryBassets[1].address, simpleToExactAmount(1))).to.be.revertedWith("Pausable: paused")
            // redeem into DAI not possible
            // swap into DAI not possible
        })
        it("should swap sUSD for TUSD to balance TUSD", async () => {
            const whale = await impersonate(currentBassets[2].whaleAddress)
            const inputTokenContract = new ERC20__factory(whale).attach(currentBassets[2].address)
            await inputTokenContract.transfer(aaveCoreV1Address, simpleToExactAmount(15000000, 18))
            await balanceBasset(mUsdV2, scaledVaultBalances, scaledTargetBalance, currentBassets[0], currentBassets[2])
        })
        it("should swap sUSD for USDT to balance sUSD", async () => {
            await balanceBasset(mUsdV2, scaledVaultBalances, scaledTargetBalance, currentBassets[0], currentBassets[3])
        })
        it("should swap USDC for USDT to balance both USDC and USDT", async () => {
            await balanceBasset(mUsdV2, scaledVaultBalances, scaledTargetBalance, currentBassets[1], currentBassets[3])
        })
        it("should not be possible to take out the sUSD", async () => {
            // mint not possible with others
            // redeem into sUSD not possible
            // swap into sUSD not possible
        })
        it("pauses BasketManager and SavingsManager", async () => {
            // do the pause
            await basketManager.pause()
            await savingsManager.pause()
            // check pause
            expect(await basketManager.paused()).eq(true)
            expect(await savingsManager.paused()).eq(true)
            // check that nothing can be called
            await expect(mUsdV2.mint(intermediaryBassets[0].address, simpleToExactAmount(1))).to.be.revertedWith("Pausable: paused")
            await expect(savingsManager.collectAndStreamInterest(mUsdV2.address)).to.be.revertedWith("Pausable: paused")
        })
        it("removes TUSD from the basket", async () => {
            await basketManager.removeBasset(TUSD.address)
        })
        it("should have valid storage before upgrade", async () => {
            await validateTokenStorage(mUsdV2, "45324893805990774527261941")
            await validateUnchangedMassetStorage(mUsdV2, "1") // bAsset personal data

            // Get new vault balances after the bAssets have been balanced
            const { bAssets } = await basketManager.getBassets()
            finalBassets.forEach((token, i) => {
                balancedVaultBalances[i] = bAssets[i].vaultBalance
                expect(bAssets[i].addr).eq(token.address)
                expect(bAssets[i].maxWeight).eq(simpleToExactAmount(2501, 14))
            })
        })
    })

    /*
     * Step 3: Upgrade mUSD
     *           1. Accept governance proposal
     *           2. Verify storage
     *           3. Unpause system
     * Test 3: i) Upgrade works as intended
     *         ii) All storage has been added & system is paused
     *         iii) Post-unpause: ensure mint, swap, redeem all work as expected
     *         iv) Collect interest & platform interest work
     *         v) Do some admin operations
     */
    describe("STEP 3 - Upgrading mUSD", () => {
        describe("accept proposal and verify storage", () => {
            // TODO - exec IRL then remove
            it("Should upgrade balanced mUSD", async () => {
                // Approve and execute call to upgradeToAndCall on mUSD proxy which then calls migrate on the new mUSD V3 implementation
                const tx = await delayedProxyAdmin.acceptUpgradeRequest(mUsdProxyAddress)
                const receipt = await tx.wait()
                console.log(`acceptUpgradeRequest gas used ${receipt.gasUsed}`)
            })
            it("Should have proper storage", async () => {
                // validate after the upgrade
                await validateTokenStorage(mUsdV3.proxy)
                await validateUnchangedMassetStorage(mUsdV3.proxy, "1")
                await validateNewMassetStorage(mUsdV3.proxy, validatorAddress, balancedVaultBalances)
            })
            it("blocks mint/swap/redeem", async () => {
                // mint/swap = Unhealthy
                await expect(mUsdV3.proxy.mint(finalBassets[0].address, simpleToExactAmount(1), 0, DEAD_ADDRESS)).to.be.revertedWith(
                    "Unhealthy",
                )
                await expect(
                    mUsdV3.proxy.mintMulti([finalBassets[0].address], [simpleToExactAmount(1)], 0, DEAD_ADDRESS),
                ).to.be.revertedWith("Unhealthy")
                await expect(
                    mUsdV3.proxy.swap(finalBassets[0].address, finalBassets[1].address, simpleToExactAmount(1), 0, DEAD_ADDRESS),
                ).to.be.revertedWith("Unhealthy")
                // redeem = In recol
                await expect(mUsdV3.proxy.redeem(finalBassets[0].address, simpleToExactAmount(1), 0, DEAD_ADDRESS)).to.be.revertedWith(
                    "In recol",
                )
                await expect(
                    mUsdV3.proxy.redeemExactBassets([finalBassets[0].address], [simpleToExactAmount(1)], 0, DEAD_ADDRESS),
                ).to.be.revertedWith("In recol")
                await expect(mUsdV3.proxy.redeemMasset(simpleToExactAmount(1), [0], DEAD_ADDRESS)).to.be.revertedWith("In recol")
            })
            it("blocks interest collection", async () => {
                // collectAndDistributeInterest
                await expect(savingsManager.collectAndDistributeInterest(mUsdV3.proxy.address)).to.be.revertedWith("Pausable: paused")
                // collectAndStreamInterest
                await expect(savingsManager.collectAndStreamInterest(mUsdV3.proxy.address)).to.be.revertedWith("Pausable: paused")
            })
            it("Should fail to upgrade mUSD again", async () => {
                await expect(mUsdV3.proxy.upgrade(validatorAddress, defaultConfig)).to.revertedWith("already upgraded")
            })
        })
        describe("unpause system and test", () => {
            it("Enables mUSD after upgrade", async () => {
                await savingsManager.unpause()
                await mUsdV3.proxy.connect(governor).negateIsolation(finalBassets[0].address)
                // Get basket state
                const basketState = await mUsdV3.proxy.basket()
                expect(basketState.undergoingRecol, "undergoingRecol").to.be.false
                expect(basketState[0], "basketState[0]").to.be.false
                expect(basketState.failed, "undergoingRecol").to.be.false
                expect(basketState[1], "basketState[1]").to.be.false
            })
            // it("moves USDT to V2", async () => {
            //     await basketManager.migrateBassets([USDT.address], aaveV2.address)
            // })
            it("Should mint after upgrade", async () => {
                const token = finalBassets[0]
                const signer = await impersonate(token.whaleAddress)
                const tokenContract = new ERC20__factory(signer).attach(token.address)
                const qty = simpleToExactAmount(10000, token.decimals)
                expect(await tokenContract.balanceOf(token.whaleAddress)).gte(qty)
                await tokenContract.approve(mUsdProxyAddress, qty)

                // Slippage protection check
                await expect(
                    mUsdV3.proxy.connect(signer).mint(token.address, qty, simpleToExactAmount(10001), await signer.getAddress()),
                ).to.be.revertedWith("Mint quantity < min qty")

                // Real mint
                const tx = mUsdV3.proxy.connect(signer).mint(token.address, qty, simpleToExactAmount(9999), await signer.getAddress())
                await expect(tx, "Minted event").to.emit(mUsdV3.proxy, "Minted")
                await (await tx).wait()
            })
            it("Should mintMulti after upgrade", async () => {
                const token = finalBassets[1]
                const signer = await impersonate(token.whaleAddress)
                const tokenContract = new ERC20__factory(signer).attach(token.address)
                const qty = simpleToExactAmount(10000, token.decimals)
                expect(await tokenContract.balanceOf(token.whaleAddress)).gte(qty)
                await tokenContract.approve(mUsdProxyAddress, qty)
                // Slippage protection check
                await expect(
                    mUsdV3.proxy.connect(signer).mintMulti([token.address], [qty], simpleToExactAmount(10001), await signer.getAddress()),
                ).to.be.revertedWith("Mint quantity < min qty")

                // Real mint
                const tx = mUsdV3.proxy
                    .connect(signer)
                    .mintMulti([token.address], [qty], simpleToExactAmount(9999), await signer.getAddress())
                await expect(tx, "Minted event").to.emit(mUsdV3.proxy, "MintedMulti")
                await (await tx).wait()
            })
            it("Should swap after upgrade", async () => {
                const token = finalBassets[2]
                const signer = await impersonate(token.whaleAddress)
                const tokenContract = new ERC20__factory(signer).attach(token.address)
                const qty = simpleToExactAmount(10000, token.decimals)
                expect(await tokenContract.balanceOf(token.whaleAddress)).gte(qty)
                await tokenContract.approve(mUsdProxyAddress, qty)
                // Slippage protection check
                await expect(
                    mUsdV3.proxy
                        .connect(signer)
                        .swap(
                            token.address,
                            finalBassets[3].address,
                            qty,
                            simpleToExactAmount(10001, finalBassets[3].decimals),
                            await signer.getAddress(),
                        ),
                ).to.be.revertedWith("Output qty < minimum qty")

                // Real mint
                const tx = mUsdV3.proxy
                    .connect(signer)
                    .swap(
                        token.address,
                        finalBassets[3].address,
                        qty,
                        simpleToExactAmount(9990, finalBassets[3].decimals),
                        await signer.getAddress(),
                    )
                await expect(tx, "Swapped event").to.emit(mUsdV3.proxy, "Swapped")
                await (await tx).wait()
            })
            it("Should redeem after upgrade", async () => {
                const token = finalBassets[3]
                const signer = await impersonate(mUsdWhaleAddress)
                const qty = simpleToExactAmount(10000, 18)
                // Slippage protection check
                await expect(
                    mUsdV3.proxy
                        .connect(signer)
                        .redeem(token.address, qty, simpleToExactAmount(10001, token.decimals), await signer.getAddress()),
                ).to.be.revertedWith("bAsset qty < min qty")

                // Real mint
                const tx = mUsdV3.proxy
                    .connect(signer)
                    .redeem(token.address, qty, simpleToExactAmount(9990, token.decimals), await signer.getAddress())
                await expect(tx, "Redeem event").to.emit(mUsdV3.proxy, "Redeemed")
                await (await tx).wait()
            })
            it("Should redeemExact after upgrade", async () => {
                const token = finalBassets[0]
                const signer = await impersonate(mUsdWhaleAddress)
                // Slippage protection check
                await expect(
                    mUsdV3.proxy
                        .connect(signer)
                        .redeemExactBassets(
                            [token.address],
                            [simpleToExactAmount(10000, token.decimals)],
                            simpleToExactAmount(9999),
                            await signer.getAddress(),
                        ),
                ).to.be.revertedWith("Redeem mAsset qty > max quantity")

                // Real mint
                const tx = mUsdV3.proxy
                    .connect(signer)
                    .redeemExactBassets(
                        [token.address],
                        [simpleToExactAmount(10000, token.decimals)],
                        simpleToExactAmount(10010),
                        await signer.getAddress(),
                    )
                await expect(tx, "Redeem event").to.emit(mUsdV3.proxy, "RedeemedMulti")
                await (await tx).wait()
            })
            it("Should redeemMasset after upgrade", async () => {
                const signer = await impersonate(mUsdWhaleAddress)
                // Slippage protection check
                await expect(
                    mUsdV3.proxy.connect(signer).redeemMasset(
                        simpleToExactAmount(10000),
                        finalBassets.map((b) => simpleToExactAmount(2501, b.decimals)),
                        await signer.getAddress(),
                    ),
                ).to.be.revertedWith("bAsset qty < min qty")

                // Real mint
                const tx = mUsdV3.proxy.connect(signer).redeemMasset(
                    simpleToExactAmount(10000),
                    finalBassets.map((b) => simpleToExactAmount(2490, b.decimals)),
                    await signer.getAddress(),
                )
                await expect(tx, "Redeem event").to.emit(mUsdV3.proxy, "RedeemedMulti")
                await (await tx).wait()
            })
            it("should collect interest after upgrade", async () => {
                await savingsManager.collectAndDistributeInterest(mUsdV3.proxy.address)
            })
        })
    })
    context("Add DAI and balance mUSD bAssets on-chain using DyDx flash loans", () => {
        let mUsdRebalancer: MusdV3Rebalance
        let scaledTargetBalance: BN
        let overweightTokenSplits: BN[]
        before(async () => {
            await network.provider.request({
                method: "hardhat_reset",
                params: [
                    {
                        forking: {
                            jsonRpcUrl: process.env.NODE_URL,
                            blockNumber: 12088142,
                        },
                    },
                ],
            })
            accounts = await impersonateAccounts()

            const basketManagerFactory = new ContractFactory(BasketManagerV2Abi, BasketManagerV2Bytecode, accounts.governor)
            basketManager = basketManagerFactory.attach(basketManagerAddress)

            // Sum up the total amount of bAssets in mUSD
            const basket = await basketManager.getBassets()
            const totalBassets = basket.bAssets.reduce((total, bAsset, i) => {
                // Convert bAsset balance up to 18 decimals
                const scaledBalance = applyDecimals(bAsset.vaultBalance, intermediaryBassets[i].decimals)
                return total.add(scaledBalance)
            }, BN.from(0))
            const musdTotal = await mUsdV2.totalSupply()
            // 25% of bAssets total
            scaledTargetBalance = totalBassets.div(4)
            console.log(`Target bAsset balance ${formatUnits(scaledTargetBalance)} = ${totalBassets} / 4. ${musdTotal} mUSD`)

            // Calculate this the splits between the overweight tokens TUSD and USDC in basis points
            const scaledOverweightTusd = (await basketManager.getBasset(TUSD.address)).vaultBalance
            const usdtInMusd = (await basketManager.getBasset(USDT.address)).vaultBalance
            const scaledOverweightUsdt = usdtInMusd.mul(1e12).sub(scaledTargetBalance)
            const scaledOverWeightTotal = scaledOverweightTusd.add(scaledOverweightUsdt)
            overweightTokenSplits = [
                scaledOverweightTusd.mul(10000).div(scaledOverWeightTotal),
                scaledOverweightUsdt.mul(10000).div(scaledOverWeightTotal),
            ]
            console.log(`TUSD ${overweightTokenSplits[0]} bps, USDT ${overweightTokenSplits[1]} bps of the overweight tokens`)

            const signer = await impersonate(daiWhaleAddress)
            const mUsdRebalancerFactory = new MusdV3Rebalance__factory(signer)
            mUsdRebalancer = await mUsdRebalancerFactory.attach(rebalancerAddress)
        })
        it("whales approve rebalance contract to fund loan shortfalls", async () => {
            // whale approves upgrade contract to spend their USDC
            const usdcWhaleSigner = await impersonate(USDC.whaleAddress)
            const usdc = new ERC20__factory(usdcWhaleSigner).attach(USDC.address)
            await usdc.approve(mUsdRebalancer.address, simpleToExactAmount(300000, USDC.decimals))

            // whale approves upgrade contract to spend their DAI
            const daiWhaleSigner = await impersonate(DAI.whaleAddress)
            const dai = new ERC20__factory(daiWhaleSigner).attach(DAI.address)
            await dai.approve(mUsdRebalancer.address, simpleToExactAmount(3000000, DAI.decimals))
        })
        it("use USDC flash loan from DyDx to balance mUSD bAssets", async () => {
            await validateFlashLoan(USDC, basketManager, mUsdRebalancer, scaledTargetBalance, overweightTokenSplits)
        })
        context("use DAI flash loan from DyDx to balance mUSD bAssets", () => {
            it("Add TUSD liquidity to Aave Core V1 for testing", async () => {
                const whale = await impersonate(TUSD.whaleAddress)
                const inputTokenContract = new ERC20__factory(whale).attach(TUSD.address)
                await inputTokenContract.transfer(aaveCoreV1Address, simpleToExactAmount(13000000, 18))
                const whale2 = await impersonate("0xf977814e90da44bfa03b6295a0616a897441acec") // Binance 8
                const inputTokenContract2 = new ERC20__factory(whale2).attach(TUSD.address)
                await inputTokenContract2.transfer(aaveCoreV1Address, simpleToExactAmount(9000000, 18))
            })
            it("first DAI flash loan", async () => {
                await validateFlashLoan(DAI, basketManager, mUsdRebalancer, scaledTargetBalance, overweightTokenSplits, 50)
            })
            // For this to work more DAI liquidity is needed in DyDx
            it.skip("second DAI flash loan", async () => {
                await validateFlashLoan(DAI, basketManager, mUsdRebalancer, scaledTargetBalance, overweightTokenSplits, 100)
            })
        })
    })
})
