/**
 * @license
 * https://github.com/bitcoincashjs/topay-wallet
 * Copyright (c) 2018 Emilio Almansi
 * Distributed under the MIT software license, see the accompanying
 * file LICENSE or http://www.opensource.org/licenses/mit-license.php.
 */

import 'babel-polyfill'
import { Address, Mnemonic, Transaction, Script } from 'bitcoincashjs'
import { assert } from 'chai'
import sinon from 'sinon'
import TopayRestClient from '../src/rest-client'
import TopayWallet from '../src/wallet'

describe('Topay Wallet', () => {
  const MNEMONIC = 'smoke drink wrap swear black museum mad approve neglect between filter source'
  const HD_PRIVATE_KEY = new Mnemonic(MNEMONIC).toHDPrivateKey()
  const HD_PUBLIC_KEY = HD_PRIVATE_KEY.hdPublicKey

  const FIRST_ADDRESS = getTestAddress(0)
  const SECOND_ADDRESS = getTestAddress(1)
  const THIRD_ADDRESS = getTestAddress(2)
  const FOURTH_ADDRESS = getTestAddress(3)

  const FIRST_ADDRESS_SCRIPT = new Script(new Address(FIRST_ADDRESS)).toHex()
  const SECOND_ADDRESS_SCRIPT = new Script(new Address(SECOND_ADDRESS)).toHex()
  const THIRD_ADDRESS_SCRIPT = new Script(new Address(THIRD_ADDRESS)).toHex()

  const CLEAN_ADDRESS_DATA = { transactions: { length: 0 } }
  const DIRTY_ADDRESS_DATA = { transactions: { length: 42 } }

  const UTXO_SET = [
    {
      txid: '0626662764ca19c014c9049a92b8401a9d2fbceed23e7bfea66091a1f0a71902',
      vout: 2,
      address: FIRST_ADDRESS,
      scriptPubKey: FIRST_ADDRESS_SCRIPT,
      satoshis: 1000
    },
    {
      txid: '1cc07b8f9cf9feb160c0e3c46c3912370de0e6d5c20f446db3360c9c2b93c0c8',
      vout: 5,
      address: FIRST_ADDRESS,
      scriptPubKey: FIRST_ADDRESS_SCRIPT,
      satoshis: 2000
    }
  ]

  const TRANSACTION_INPUTS = [
    {
      txId: '0626662764ca19c014c9049a92b8401a9d2fbceed23e7bfea66091a1f0a71902',
      outputIndex: 2,
      address: FIRST_ADDRESS,
      script: FIRST_ADDRESS_SCRIPT,
      satoshis: 1000
    },
    {
      txId: '1cc07b8f9cf9feb160c0e3c46c3912370de0e6d5c20f446db3360c9c2b93c0c8',
      outputIndex: 5,
      address: FIRST_ADDRESS,
      script: FIRST_ADDRESS_SCRIPT,
      satoshis: 2000
    }
  ]

  const TRANSACTION_INPUTS_BALANCE =
    TRANSACTION_INPUTS.reduce((total, input) => total + input.satoshis, 0)

  describe('#initialize()', async () => {
    it('should initialize succesfully on a clean wallet', async () => {
      await getInitializedEmptyWallet()
    })
    it('should initialize succesfully on a dirty wallet', async () => {
      await getInitializedWallet((restClient) => {
        restClient.getAddress = sinon.stub()
        restClient.getAddress.withArgs(FIRST_ADDRESS)
          .onFirstCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(SECOND_ADDRESS)
          .onFirstCall().returns(CLEAN_ADDRESS_DATA)
      })
    })
  })

  describe('#getBalance()', async () => {
    it('should return 0 for a clean wallet', async () => {
      const wallet = await getInitializedEmptyWallet()
      assert.strictEqual(await wallet.getBalance(), 0)
    })
    it('should return the balance of the last used address for a dirty wallet', async () => {
      const balance = 42
      const wallet = await getInitializedWallet((restClient) => {
        restClient.getAddress = sinon.stub()
        restClient.getAddress.withArgs(FIRST_ADDRESS)
          .onFirstCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(SECOND_ADDRESS)
          .onFirstCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(THIRD_ADDRESS)
          .onFirstCall().returns(CLEAN_ADDRESS_DATA)
          .onSecondCall().returns(CLEAN_ADDRESS_DATA)
        restClient.getBalance.withArgs(SECOND_ADDRESS)
          .onFirstCall().returns(balance)
      })
      assert.strictEqual(await wallet.getBalance(), balance)
    })
  })

  describe('#getReceiveAddress()', async () => {
    it('should return the first derived address for a clean wallet', async () => {
      const wallet = await getInitializedEmptyWallet()
      assert.strictEqual(
        await wallet.getReceiveAddress(),
        FIRST_ADDRESS
      )
    })
    it('should return the n-th derived address for a dirty wallet', async () => {
      const wallet = await getInitializedWallet((restClient) => {
        restClient.getAddress = sinon.stub()
        restClient.getAddress.withArgs(FIRST_ADDRESS)
          .onFirstCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(SECOND_ADDRESS)
          .onFirstCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(THIRD_ADDRESS)
          .onFirstCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(FOURTH_ADDRESS)
        .onFirstCall().returns(CLEAN_ADDRESS_DATA)
        .onSecondCall().returns(CLEAN_ADDRESS_DATA)
      })
      assert.strictEqual(
        await wallet.getReceiveAddress(),
        FOURTH_ADDRESS
      )
    })
  })

  describe('#send()', async () => {
    it('should send a payment to its own receive address successfully', async () => {
      const sendTransaction = sinon.stub()
      const transactionId = 'some transaction id'
      const wallet = await getInitializedWallet((restClient) => {
        restClient.getAddress = sinon.stub()
        restClient.getAddress.withArgs(FIRST_ADDRESS)
          .returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(SECOND_ADDRESS)
          .returns(CLEAN_ADDRESS_DATA)
        restClient.getUtxoSet = sinon.stub()
        restClient.getUtxoSet.withArgs(FIRST_ADDRESS)
          .onFirstCall().returns(UTXO_SET)
        restClient.sendTransaction = sendTransaction
        restClient.sendTransaction.returns(transactionId)
      })
      const amount = TRANSACTION_INPUTS_BALANCE / 2
      assert.strictEqual(await wallet.send(SECOND_ADDRESS, amount), transactionId)
      assert.isTrue(sendTransaction.calledOnce)
      const transaction = new Transaction(sendTransaction.firstCall.args[0])
      const transactionObj = transaction.toObject()
      assert.strictEqual(transactionObj.outputs.length, 1)
      const output = transactionObj.outputs[0]
      assert.strictEqual(output.script, SECOND_ADDRESS_SCRIPT)
      const estimatedBytes = 150 * TRANSACTION_INPUTS.length + 50
      const estimatedFee = estimatedBytes * wallet._satoshisPerByte
      assert.approximately(output.satoshis, TRANSACTION_INPUTS_BALANCE - estimatedFee, 20)
    })
    it('should send a payment without pre-specified fee successfully', async () => {
      const sendTransaction = sinon.stub()
      const transactionId = 'some transaction id'
      const wallet = await getInitializedWallet((restClient) => {
        restClient.getAddress = sinon.stub()
        restClient.getAddress.withArgs(FIRST_ADDRESS)
          .returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(SECOND_ADDRESS)
          .returns(CLEAN_ADDRESS_DATA)
        restClient.getUtxoSet = sinon.stub()
        restClient.getUtxoSet.withArgs(FIRST_ADDRESS)
          .onFirstCall().returns(UTXO_SET)
        restClient.sendTransaction = sendTransaction
        restClient.sendTransaction.returns(transactionId)
      })
      const amount = TRANSACTION_INPUTS_BALANCE / 2
      assert.strictEqual(await wallet.send(THIRD_ADDRESS, amount), transactionId)
      assert.isTrue(sendTransaction.calledOnce)
      const transaction = new Transaction(sendTransaction.firstCall.args[0])
      const transactionObj = transaction.toObject()
      assert.strictEqual(transactionObj.outputs.length, 2)
      assert.isTrue(transactionObj.outputs.some(output => {
        return output.script === THIRD_ADDRESS_SCRIPT &&
          output.satoshis === amount
      }))
      assert.isTrue(transactionObj.outputs.some(output => {
        return output.script === SECOND_ADDRESS_SCRIPT
      }))
    })
    it('should send a payment without a pre-specified fee successfully', async () => {
      const sendTransaction = sinon.stub()
      const transactionId = 'some other transaction id'
      const wallet = await getInitializedWallet((restClient) => {
        restClient.getAddress = sinon.stub()
        restClient.getAddress.withArgs(FIRST_ADDRESS)
          .returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(SECOND_ADDRESS)
          .returns(CLEAN_ADDRESS_DATA)
        restClient.getUtxoSet = sinon.stub()
        restClient.getUtxoSet.withArgs(FIRST_ADDRESS)
          .onFirstCall().returns(UTXO_SET)
        restClient.sendTransaction = sendTransaction
        restClient.sendTransaction.returns(transactionId)
      })
      const amount = TRANSACTION_INPUTS_BALANCE / 2
      const fee = 500
      assert.strictEqual(await wallet.send(THIRD_ADDRESS, amount, 500), transactionId)
      assert.isTrue(sendTransaction.calledOnce)
      const transaction = new Transaction(sendTransaction.firstCall.args[0])
      const transactionObj = transaction.toObject()
      assert.strictEqual(transactionObj.outputs.length, 2)
      assert.isTrue(transactionObj.outputs.some(output => {
        return output.script === THIRD_ADDRESS_SCRIPT &&
          output.satoshis === amount
      }))
      assert.isTrue(transactionObj.outputs.some(output => {
        return output.script === SECOND_ADDRESS_SCRIPT &&
          output.satoshis === TRANSACTION_INPUTS_BALANCE - amount - fee
      }))
    })
  })

  describe('#widthraw()', async () => {
    it('should produce a single output to the widthraw address', async () => {
      const sendTransaction = sinon.stub()
      const transactionId = 'some other transaction id'
      const wallet = await getInitializedWallet((restClient) => {
        restClient.getAddress = sinon.stub()
        restClient.getAddress.withArgs(FIRST_ADDRESS)
          .returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(SECOND_ADDRESS)
          .returns(CLEAN_ADDRESS_DATA)
        restClient.getUtxoSet = sinon.stub()
        restClient.getUtxoSet.withArgs(FIRST_ADDRESS)
          .onFirstCall().returns(UTXO_SET)
        restClient.sendTransaction = sendTransaction
        restClient.sendTransaction.returns(transactionId)
      })
      assert.strictEqual(await wallet.widthraw(THIRD_ADDRESS), transactionId)
      assert.isTrue(sendTransaction.calledOnce)
      const transaction = new Transaction(sendTransaction.firstCall.args[0])
      const transactionObj = transaction.toObject()
      assert.strictEqual(transactionObj.outputs.length, 1)
      assert.strictEqual(
        transactionObj.outputs[0].script,
        THIRD_ADDRESS_SCRIPT
      )
      const output = transactionObj.outputs[0].satoshis
      const estimatedBytes = 150 * TRANSACTION_INPUTS.length + 50
      const estimatedFee = estimatedBytes * wallet._satoshisPerByte
      assert.approximately(output + estimatedFee, TRANSACTION_INPUTS_BALANCE, 50)
    })
  })

  describe('#_updateWalletIndex()', async () => {
    it('should keep wallet index at 0 for a clean wallet', async () => {
      const wallet = await getInitializedEmptyWallet()
      await wallet._updateWalletIndex()
      assert.strictEqual(wallet._walletIndex, 0)
    })
    it('should keep wallet index at the number of used addresses for a dirty wallet', async () => {
      const wallet = await getInitializedWallet((restClient) => {
        restClient.getAddress = sinon.stub()
        restClient.getAddress.withArgs(FIRST_ADDRESS)
          .onFirstCall().returns(CLEAN_ADDRESS_DATA)
          .onSecondCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(SECOND_ADDRESS)
          .onFirstCall().returns(CLEAN_ADDRESS_DATA)
          .onSecondCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(THIRD_ADDRESS)
          .onFirstCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(FOURTH_ADDRESS)
          .onFirstCall().returns(CLEAN_ADDRESS_DATA)
      })
      assert.strictEqual(wallet._walletIndex, 0)
      await wallet._updateWalletIndex()
      assert.strictEqual(wallet._walletIndex, 1)
      await wallet._updateWalletIndex()
      assert.strictEqual(wallet._walletIndex, 3)
    })
  })

  describe('#_getAvailableInputs()', async () => {
    it('should fail on an empty wallet', async () => {
      await assertThrows(async () => {
        const wallet = await getInitializedEmptyWallet()
        await wallet._getAvailableInputs()
      })
    })
    it('should return all utxos from the last used address as inputs', async () => {
      const wallet = await getInitializedWallet((restClient) => {
        restClient.getAddress = sinon.stub()
        restClient.getAddress.withArgs(FIRST_ADDRESS)
          .onFirstCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(SECOND_ADDRESS)
          .onFirstCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(THIRD_ADDRESS)
          .onFirstCall().returns(CLEAN_ADDRESS_DATA)
        restClient.getUtxoSet = sinon.stub()
        restClient.getUtxoSet.withArgs(SECOND_ADDRESS)
          .onFirstCall().returns(UTXO_SET)
      })
      assert.deepEqual(await wallet._getAvailableInputs(), TRANSACTION_INPUTS)
    })
  })

  describe('#_calculateFee()', async () => {
    it('should calculate fee without change address correctly', async () => {
      const wallet = await getInitializedWallet((restClient) => {
        restClient.getAddress = sinon.stub()
        restClient.getAddress.withArgs(FIRST_ADDRESS)
          .onFirstCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(SECOND_ADDRESS)
          .onFirstCall().returns(CLEAN_ADDRESS_DATA)
      })
      const fee = wallet._calculateFee(
        TRANSACTION_INPUTS,
        THIRD_ADDRESS,
        TRANSACTION_INPUTS_BALANCE
      )
      const outputsCount = 1
      const estimatedBytes = 150 * TRANSACTION_INPUTS.length + 20 * outputsCount + 30
      assert.approximately(fee, estimatedBytes * wallet._satoshisPerByte, 20)
    })
    it('should calculate fee with change address correctly', async () => {
      const wallet = await getInitializedWallet((restClient) => {
        restClient.getAddress = sinon.stub()
        restClient.getAddress.withArgs(FIRST_ADDRESS)
          .onFirstCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(SECOND_ADDRESS)
          .onFirstCall().returns(CLEAN_ADDRESS_DATA)
      })
      const fee = wallet._calculateFee(
        TRANSACTION_INPUTS,
        THIRD_ADDRESS,
        TRANSACTION_INPUTS_BALANCE / 2
      )
      const outputsCount = 2
      const estimatedBytes = 150 * TRANSACTION_INPUTS.length + 20 * outputsCount + 30
      assert.approximately(fee, estimatedBytes * wallet._satoshisPerByte, 20)
    })
  })

  describe('#_buildTransaction()', async () => {
    it('should fail if balance is insufficient', async () => {
      await assertThrows(async () => {
        const wallet = await getInitializedWallet((restClient) => {
          restClient.getAddress = sinon.stub()
          restClient.getAddress.withArgs(FIRST_ADDRESS)
            .onFirstCall().returns(DIRTY_ADDRESS_DATA)
          restClient.getAddress.withArgs(SECOND_ADDRESS)
            .onFirstCall().returns(CLEAN_ADDRESS_DATA)
        })
        const fee = 500
        wallet._buildTransaction(
          TRANSACTION_INPUTS,
          THIRD_ADDRESS,
          TRANSACTION_INPUTS_BALANCE * 2,
          fee
        )
      })
    })
    it('should build a transaction with no change address successfully', async () => {
      const wallet = await getInitializedWallet((restClient) => {
        restClient.getAddress = sinon.stub()
        restClient.getAddress.withArgs(FIRST_ADDRESS)
          .onFirstCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(SECOND_ADDRESS)
          .onFirstCall().returns(CLEAN_ADDRESS_DATA)
      })
      const fee = 500
      const transaction = wallet._buildTransaction(
        TRANSACTION_INPUTS,
        THIRD_ADDRESS,
        TRANSACTION_INPUTS_BALANCE - fee,
        fee
      )
      assert.isTrue(transaction.isFullySigned())
      const transactionObj = transaction.toObject()
      assert.strictEqual(transactionObj.inputs.length, TRANSACTION_INPUTS.length)
      for (let i = 0; i < TRANSACTION_INPUTS.length; ++i) {
        assert.strictEqual(
          transactionObj.inputs[i].output.satoshis,
          TRANSACTION_INPUTS[i].satoshis
        )
      }
      assert.strictEqual(transactionObj.outputs.length, 1)
      assert.strictEqual(transactionObj.outputs[0].satoshis, TRANSACTION_INPUTS_BALANCE - fee)
    })
    it('should build a transaction with change address successfully', async () => {
      const wallet = await getInitializedWallet((restClient) => {
        restClient.getAddress = sinon.stub()
        restClient.getAddress.withArgs(FIRST_ADDRESS)
          .onFirstCall().returns(DIRTY_ADDRESS_DATA)
        restClient.getAddress.withArgs(SECOND_ADDRESS)
          .onFirstCall().returns(CLEAN_ADDRESS_DATA)
      })
      const amount = 1000
      const fee = 500
      const transaction = wallet._buildTransaction(
        TRANSACTION_INPUTS,
        THIRD_ADDRESS,
        amount,
        fee
      )
      assert.isTrue(transaction.isFullySigned())
      const transactionObj = transaction.toObject()
      assert.strictEqual(transactionObj.inputs.length, TRANSACTION_INPUTS.length)
      for (let i = 0; i < TRANSACTION_INPUTS.length; ++i) {
        assert.strictEqual(
          transactionObj.inputs[i].output.satoshis,
          TRANSACTION_INPUTS[i].satoshis
        )
      }
      assert.strictEqual(transactionObj.outputs.length, 2)
      assert.isTrue(transactionObj.outputs.some(output => {
        return output.satoshis === amount
      }))
      assert.isTrue(transactionObj.outputs.some(output => {
        return output.satoshis === TRANSACTION_INPUTS_BALANCE - amount - fee
      }))
    })
  })

  describe('#_getPrivateKey()', () => {
    it('should fail for an invalid index', async () => {
      const wallet = await getInitializedEmptyWallet()
      for (const value of [null, {}, '', -1, 1001]) {
        assert.throws(() => {
          wallet._getPrivateKey(value)
        })
      }
    })
    it('should derive the n-th private key correctly', async () => {
      const wallet = await getInitializedEmptyWallet()
      for (let index = 0; index < 100; ++index) {
        assert.deepEqual(
          wallet._getPrivateKey(index),
          HD_PRIVATE_KEY.derive(index).privateKey
        )
      }
    })
  })

  describe('#_getPublicKey()', () => {
    it('should fail for an invalid index', async () => {
      const wallet = await getInitializedEmptyWallet()
      for (const value of [null, {}, '', -1, 1001]) {
        assert.throws(() => {
          wallet._getPublicKey(value)
        })
      }
    })
    it('should derive the n-th public key correctly', async () => {
      const wallet = await getInitializedEmptyWallet()
      for (let index = 0; index < 100; ++index) {
        assert.deepEqual(
          wallet._getPublicKey(index),
          getTestPublicKey(index)
        )
      }
    })
  })

  describe('#_getAddress()', () => {
    it('should fail for an invalid index', async () => {
      const wallet = await getInitializedEmptyWallet()
      for (const value of [null, {}, '', -1, 1001]) {
        assert.throws(() => {
          wallet._getAddress(value)
        })
      }
    })
    it('should derive the n-th address correctly', async () => {
      const wallet = await getInitializedEmptyWallet()
      for (let index = 0; index < 100; ++index) {
        assert.strictEqual(
          wallet._getAddress(index),
          getTestAddress(index)
        )
      }
    })
  })

  function getTestPublicKey (index) {
    return HD_PUBLIC_KEY.derive(index).publicKey
  }

  function getTestAddress (index) {
    return getTestPublicKey(index).toAddress().toString()
  }

  async function getInitializedWallet (attachStubs) {
    const restClient = sinon.createStubInstance(TopayRestClient)
    attachStubs(restClient)
    const wallet = new TopayWallet(MNEMONIC, restClient)
    await wallet.initialize()
    return wallet
  }

  async function getInitializedEmptyWallet () {
    const wallet = await getInitializedWallet((restClient) => {
      restClient.getAddress = sinon.stub()
      restClient.getAddress.withArgs(FIRST_ADDRESS)
        .returns(CLEAN_ADDRESS_DATA)
    })
    return wallet
  }

  async function assertThrows (asyncFn) {
    let throws = false
    try {
      await asyncFn()
    } catch (error) {
      throws = true
    }
    assert.isTrue(throws)
  }
})
