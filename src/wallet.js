/**
 * @license
 * https://github.com/bitcoincashjs/topay-wallet
 * Copyright (c) 2018 Emilio Almansi
 * Distributed under the MIT software license, see the accompanying
 * file LICENSE or http://www.opensource.org/licenses/mit-license.php.
 */

import { Address, Mnemonic, Transaction } from 'bitcoincashjs'
import { checkArgument } from 'conditional'
import TopayError from './error'
import TopayRestClient from './rest-client'

export default class TopayWallet {
  /**
   * Simple deterministic wallet based on BIP39 mnemonic codes.
   * @constructor TopayWallet
   * @param {string} mnemonic - BIP39 Mnemonic code encoding the wallet's seed.
   * @param {TopayRestClient} restClient - REST client.
   */
  constructor (mnemonic, restClient) {
    checkArgument(typeof mnemonic === 'string', 'mnemonic')
    checkArgument(restClient instanceof TopayRestClient, 'restClient')
    this._mnemonic = new Mnemonic(mnemonic)
    this._hdPrivateKey = this._mnemonic.toHDPrivateKey()
    this._hdPublicKey = this._hdPrivateKey.hdPublicKey
    this._walletIndex = 0
    this._maxWalletIndex = 1000
    this._satoshisPerByte = 1.1
    this._restClient = restClient
  }

  /**
   * Initialize wallet by increasing the wallet index past all used adresses.
   * @throws {TopayError}
   */
  async initialize () {
    await this._updateWalletIndex()
  }

  /**
   * Get the wallet's current balance in satoshis.
   * @returns {number}
   * @throws {TopayError}
   */
  async getBalance () {
    await this._updateWalletIndex()
    if (this._walletIndex === 0) {
      return 0
    }
    const address = this._getAddress(this._walletIndex - 1)
    const balance = await this._restClient.getBalance(address)
    return balance
  }

  /**
   * Get the next unused address where new funds should be sent.
   * @returns {string}
   * @throws {TopayError}
   */
  async getReceiveAddress () {
    await this._updateWalletIndex()
    return this._getAddress(this._walletIndex)
  }

  /**
   * Send funds to a recipient address. The specific fee to be used can be
   * specified explicitly, or else it will be calculated automatically to
   * a rate of around 1 satoshi per byte. Returns the id of the broadcasted
   * transaction, or throws {@link TopayError} if the available balance is
   * insufficient.
   * @param {string} recipient - Recipient address.
   * @param {number} amount - Amount in satoshis.
   * @param {number=} fee - Fee in satoshis. Optional.
   * @returns {string}
   * @throws {TopayError}
   */
  async send (recipient, amount, fee) {
    checkArgument(Address.isValid(recipient, 'livenet'), 'recipient')
    checkArgument(Number.isInteger(amount), 'amount')
    checkArgument(fee === undefined || Number.isInteger(fee), 'fee')
    await this._updateWalletIndex()
    const inputs = await this._getAvailableInputs()
    if (fee === undefined) {
      fee = this._calculateFee(inputs, recipient, amount)
    }
    const transaction = this._buildTransaction(inputs, recipient, amount, fee)
    const transactionId = await this._restClient.sendTransaction(transaction.toString())
    return transactionId
  }

  /**
   * Sends all remaining funds in the wallet to a recipient address.
   * Returns the id of the broadcasted transaction, or throws {@link TopayError}
   * if the available balance is insufficient.
   * @param {string} recipient - Recipient address.
   * @returns {string}
   * @throws {TopayError}
   */
  async widthraw (recipient) {
    checkArgument(Address.isValid(recipient, 'livenet'), 'recipient')
    await this._updateWalletIndex()
    const inputs = await this._getAvailableInputs()
    const balance = inputs.reduce((total, input) => total + input.satoshis, 0)
    const fee = this._calculateFee(inputs, recipient, balance)
    const transaction = this._buildTransaction(inputs, recipient, balance - fee, fee)
    const transactionId = await this._restClient.sendTransaction(transaction.toString())
    return transactionId
  }

  /**
   * Updates the wallet index to point at the first unused address of
   * all addresses derived from this wallet's seed. An address is
   * considered used if it appears in at least one transaction.
   * @throws {TopayError}
   */
  async _updateWalletIndex () {
    while (this._walletIndex < this._maxWalletIndex) {
      const address = this._getAddress(this._walletIndex)
      const { transactions } = await this._restClient.getAddress(address)
      if (transactions.length === 0) {
        break
      }
      ++this._walletIndex
    }
  }

  /**
   * Gets all the wallet's available transaction inputs.
   * @returns {Array}
   * @throws {TopayError}
   */
  async _getAvailableInputs () {
    const address = this._getAddress(this._walletIndex - 1)
    const utxoSet = await this._restClient.getUtxoSet(address)
    return utxoSet.map(utxo => ({
      txId: utxo.txid,
      outputIndex: utxo.vout,
      address: utxo.address,
      script: utxo.scriptPubKey,
      satoshis: utxo.satoshis
    }))
  }

  /**
   * Calculates the fee needed to broadcast a transaction sending
   * 'amount' satoshis from the given inputs to the recipient address.
   * @private
   * @param {Array} inputs - Transaction inputs.
   * @param {string} recipient - Recipient address.
   * @param {number} amount - Amount in satoshis.
   * @throws {TopayError}
   */
  _calculateFee (inputs, recipient, amount) {
    const transaction = this._buildTransaction(inputs, recipient, amount, 0)
    const transactionBytes = transaction.toString().length / 2
    return Math.ceil(transactionBytes * this._satoshisPerByte)
  }

  /**
   * Builds a transaction sending 'amount' satoshis to the given
   * recipient address. Funds are taken from the given inputs, and
   * distributed between the recipient address, the wallet's next
   * receive address (the change address), and the specified miner's
   * fees. Throws a {@link TopayError} if the funds available are
   * insufficient.
   * @private
   * @param {Array} inputs - Transaction inputs.
   * @param {string} recipient - Recipient address.
   * @param {number} amount - Amount in satoshis.
   * @param {number} fee - Fee in satoshis.
   * @returns {Transaction}
   * @throws {TopayError}
   */
  _buildTransaction (inputs, recipient, amount, fee) {
    const balance = inputs.reduce((total, input) => total + input.satoshis, 0)
    if (balance < amount + fee) {
      throw new TopayError('Cannot create transaction', 'Insufficient funds.')
    }
    const change = balance - amount - fee
    const changeAddress = this._getAddress(this._walletIndex)
    const privateKey = this._getPrivateKey(this._walletIndex - 1)
    let transaction = new Transaction().from(inputs)
    if (recipient !== changeAddress) {
      transaction = transaction.to(recipient, amount)
      if (change > 0) {
        transaction = transaction.to(changeAddress, change)
      }
    } else {
      transaction = transaction.to(recipient, amount + change)
    }
    transaction = transaction.sign(privateKey)
    return transaction
  }

  /**
   * Returns the private key derived from the wallet's seed at the given index.
   * @private
   * @param {number} index - Wallet index.
   * @returns {PrivateKey}
   */
  _getPrivateKey (index) {
    checkArgument(
      Number.isInteger(index) && index >= 0 && index <= this._maxWalletIndex,
      'index'
    )
    return this._hdPrivateKey.derive(index).privateKey
  }

  /**
   * Returns the public key derived from the wallet's seed at the given index.
   * @private
   * @param {number} index - Wallet index.
   * @returns {PublicKey}
   */
  _getPublicKey (index) {
    checkArgument(
      Number.isInteger(index) && index >= 0 && index <= this._maxWalletIndex,
      'index'
    )
    return this._hdPublicKey.derive(index).publicKey
  }

  /**
   * Returns the address for the public key derived from the wallet's seed
   * at the given index.
   * @private
   * @param {number} index - Wallet index.
   * @returns {string}
   */
  _getAddress (index) {
    return this._getPublicKey(index).toAddress().toString()
  }
}
