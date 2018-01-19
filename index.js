const { RestClient, RestClientError } = require('./rest');
const { Wallet, WalletError } = require('./wallet');

;(async () => {

  try {
    // const mnemonic = 'feed couch morning vibrant regret urge open mutual vocal foil fresh horse';
    const mnemonic = 'sign beach purchase invite census feel title rent foam permit chaos vicious';
    const restClient = new RestClient('https://bitcoincash.blockexplorer.com/api/');
    let wallet = new Wallet(mnemonic, restClient);
    // console.log(await wallet.send('1BUCJE3LE2Fy5hvxNfywAem3E2NesNi4Mb', 494384, 200));
    console.log(await wallet.getBalance());
    console.log(await wallet.getReceiveAddress());
  }
  catch (error) {
    console.error(error);
  }

})();
