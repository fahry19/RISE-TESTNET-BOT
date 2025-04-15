const blessed = require('blessed');
const { ethers } = require('ethers');
const config = require('./config/config');
const accounts = require('./accounts/accounts');
const axios = require('axios');

// Initialize Blessed screen
const screen = blessed.screen({
  smartCSR: true,
  title: 'Rise Testnet Bot - GHOSTDROP',
});

// UI components
const dashboard = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  style: { bg: 'black' },
});

const header = blessed.box({
  parent: dashboard,
  top: 0,
  left: 'center',
  width: '100%',
  height: 3,
  content: '{bold}{green-fg}RISE TESTNET BOT - GHOSTDROP{/}',
  tags: true,
  align: 'center',
  style: { bg: 'black', fg: 'green' },
});

const menuBox = blessed.list({
  parent: dashboard,
  top: 3,
  left: 0,
  width: '30%',
  height: '50%',
  label: '{bold}{cyan-fg}Menu{/}',
  border: { type: 'line', fg: 'cyan' },
  style: { bg: 'black', fg: 'green', selected: { bg: 'green', fg: 'black' } },
  keys: true,
  items: [
    '1. Request Faucet',
    '2. Deposit ETH (Gateway)',
    '3. Withdraw WETH (Gateway)',
    '4. Wrap ETH to WETH (Direct)',
    '5. Unwrap WETH to ETH (Direct)',
    '6. Swap WETH to USDC',
    '7. Swap USDC to WETH',
    '8. Swap ETH to USDC',
    '9. Approve WETH for DODO',
    '10. Approve USDC for DODO',
    '11. Check Balances',
    '12. Clear Logs',
    '13. Auto All',
    '14. Exit',
  ],
});

const logBox = blessed.log({
  parent: dashboard,
  top: 3,
  left: '30%',
  width: '70%',
  height: '70%',
  label: '{bold}{cyan-fg}System Logs{/}',
  border: { type: 'line', fg: 'cyan' },
  style: { bg: 'black', fg: 'green' },
  scrollable: true,
  scrollbar: { bg: 'cyan', fg: 'black' },
  tags: true,
});

const statusBox = blessed.box({
  parent: dashboard,
  top: '53%',
  left: 0,
  width: '30%',
  height: '20%',
  label: '{bold}{cyan-fg}Status{/}',
  border: { type: 'line', fg: 'cyan' },
  style: { bg: 'black', fg: 'green' },
  content: 'Wallets: 0\nLive Tx Count: 0',
  tags: true,
});

const inputBox = blessed.textbox({
  parent: dashboard,
  top: '73%',
  left: 'center',
  width: 40,
  height: 3,
  label: '{bold}{cyan-fg}Enter Amount{/}',
  border: { type: 'line', fg: 'cyan' },
  style: { bg: 'black', fg: 'green' },
  hidden: true,
  inputOnFocus: true,
});

const txCountBox = blessed.textbox({
  parent: dashboard,
  top: '73%',
  left: 'center',
  width: 40,
  height: 3,
  label: '{bold}{cyan-fg}Enter Number of Transactions{/}',
  border: { type: 'line', fg: 'cyan' },
  style: { bg: 'black', fg: 'green' },
  hidden: true,
  inputOnFocus: true,
});

screen.append(dashboard);

// Bot state
let walletCount = accounts.length;
let txCount = 0;
let autoAllRunning = false;

// Logging function
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  let formattedMessage;
  switch (level) {
    case 'error':
      formattedMessage = `{red-fg}[${timestamp}] ${message}{/}`;
      break;
    case 'success':
      formattedMessage = `{green-fg}[${timestamp}] ${message}{/}`;
      break;
    case 'warning':
      formattedMessage = `{yellow-fg}[${timestamp}] ${message}{/}`;
      break;
    default:
      formattedMessage = `{white-fg}[${timestamp}] ${message}{/}`;
  }
  logBox.log(formattedMessage);
}

// Update status
function updateStatus() {
  statusBox.setContent(`Wallets: ${walletCount}\nLive Tx Count: ${txCount}`);
  screen.render();
}

// Initialize contracts
const provider = new ethers.JsonRpcProvider(config.network.rpc);
const gatewayContract = new ethers.Contract(
  config.CONTRACT_ADDRESSES.WrappedTokenGatewayV3,
  config.WrappedTokenGatewayV3ABI,
  provider
);
const wethContract = new ethers.Contract(config.CONTRACT_ADDRESSES.WETH, config.WETH_ABI, provider);
const usdcContract = new ethers.Contract(config.CONTRACT_ADDRESSES.USDC, config.USDC_ABI, provider);
const dodoContract = new ethers.Contract(
  config.CONTRACT_ADDRESSES.DODOFeeRouteProxy,
  config.DODOFeeRouteProxyABI,
  provider
);

// Utility to truncate hashes
function truncateHash(hash) {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

// Bot functions
async function requestFaucet(wallet, signer) {
  try {
    log(`Requesting faucet for ${wallet.address}...`);
    const response = await axios.post(config.network.faucet, { address: wallet.address });
    log(`Faucet success: ${response.data.message || 'Funds requested'}`, 'success');
    txCount++;
    updateStatus();
  } catch (error) {
    log(`Faucet error: ${error.message}`, 'error');
  }
}

async function depositETHGateway(wallet, signer, amount, txCountInput) {
  try {
    const depositAmount = ethers.parseEther(amount);
    const balance = await provider.getBalance(wallet.address);
    if (balance < depositAmount * BigInt(txCountInput)) {
      log(`Insufficient balance: ${ethers.formatEther(balance)} ETH for ${txCountInput} txs`, 'error');
      return false;
    }
    for (let i = 0; i < txCountInput; i++) {
      log(`Depositing ${amount} ETH via Gateway (Tx ${i + 1}/${txCountInput}) for ${wallet.address}...`);
      const tx = await gatewayContract.connect(signer).depositETH(
        config.CONTRACT_ADDRESSES.WETH,
        wallet.address,
        0,
        { value: depositAmount, gasLimit: 200000 }
      );
      await tx.wait();
      log(`Deposit successful: ${truncateHash(tx.hash)}`, 'success');
      txCount++;
      updateStatus();
      if (i < txCountInput - 1) await new Promise((resolve) => setTimeout(resolve, config.delay));
    }
    return true;
  } catch (error) {
    log(`Deposit error: ${error.message}`, 'error');
    return false;
  }
}

async function withdrawWETHGateway(wallet, signer, amount, txCountInput) {
  try {
    const withdrawAmount = ethers.parseEther(amount);
    const wethBalance = await wethContract.balanceOf(wallet.address);
    if (wethBalance < withdrawAmount * BigInt(txCountInput)) {
      log(`Insufficient WETH: ${ethers.formatEther(wethBalance)} for ${txCountInput} txs`, 'error');
      return false;
    }
    for (let i = 0; i < txCountInput; i++) {
      log(`Withdrawing ${amount} WETH via Gateway (Tx ${i + 1}/${txCountInput}) for ${wallet.address}...`);
      const tx = await gatewayContract.connect(signer).withdrawETH(
        config.CONTRACT_ADDRESSES.WETH,
        withdrawAmount,
        wallet.address,
        { gasLimit: 200000 }
      );
      await tx.wait();
      log(`Withdraw successful: ${truncateHash(tx.hash)}`, 'success');
      txCount++;
      updateStatus();
      if (i < txCountInput - 1) await new Promise((resolve) => setTimeout(resolve, config.delay));
    }
    return true;
  } catch (error) {
    log(`Withdraw error: ${error.message}`, 'error');
    return false;
  }
}

async function wrapETHDirect(wallet, signer, amount, txCountInput) {
  try {
    const wrapAmount = ethers.parseEther(amount);
    const balance = await provider.getBalance(wallet.address);
    if (balance < wrapAmount * BigInt(txCountInput)) {
      log(`Insufficient balance: ${ethers.formatEther(balance)} ETH for ${txCountInput} txs`, 'error');
      return false;
    }
    for (let i = 0; i < txCountInput; i++) {
      log(`Wrapping ${amount} ETH to WETH directly (Tx ${i + 1}/${txCountInput}) for ${wallet.address}...`);
      const tx = await wethContract.connect(signer).deposit(
        { value: wrapAmount, gasLimit: 100000 }
      );
      await tx.wait();
      log(`Wrap successful: ${truncateHash(tx.hash)}`, 'success');
      txCount++;
      updateStatus();
      if (i < txCountInput - 1) await new Promise((resolve) => setTimeout(resolve, config.delay));
    }
    return true;
  } catch (error) {
    log(`Wrap error: ${error.message}`, 'error');
    return false;
  }
}

async function unwrapWETHDirect(wallet, signer, amount, txCountInput) {
  try {
    const unwrapAmount = ethers.parseEther(amount);
    const wethBalance = await wethContract.balanceOf(wallet.address);
    if (wethBalance < unwrapAmount * BigInt(txCountInput)) {
      log(`Insufficient WETH: ${ethers.formatEther(wethBalance)} for ${txCountInput} txs`, 'error');
      return false;
    }
    for (let i = 0; i < txCountInput; i++) {
      log(`Unwrapping ${amount} WETH to ETH directly (Tx ${i + 1}/${txCountInput}) for ${wallet.address}...`);
      const tx = await wethContract.connect(signer).withdraw(
        unwrapAmount,
        { gasLimit: 100000 }
      );
      await tx.wait();
      log(`Unwrap successful: ${truncateHash(tx.hash)}`, 'success');
      txCount++;
      updateStatus();
      if (i < txCountInput - 1) await new Promise((resolve) => setTimeout(resolve, config.delay));
    }
    return true;
  } catch (error) {
    log(`Unwrap error: ${error.message}`, 'error');
    return false;
  }
}

async function swapWETHtoUSDC(wallet, signer, amount, txCountInput) {
  try {
    const swapAmount = ethers.parseEther(amount);
    const wethBalance = await wethContract.balanceOf(wallet.address);
    if (wethBalance < swapAmount * BigInt(txCountInput)) {
      log(`Insufficient WETH: ${ethers.formatEther(wethBalance)} for ${txCountInput} txs`, 'error');
      return false;
    }
    for (let i = 0; i < txCountInput; i++) {
      log(`Approving ${amount} WETH for DODO (Tx ${i + 1}/${txCountInput})...`);
      const approveTx = await wethContract.connect(signer).approve(
        config.CONTRACT_ADDRESSES.DODOFeeRouteProxy,
        swapAmount,
        { gasLimit: 100000 }
      );
      await approveTx.wait();
      log(`Approval successful: ${truncateHash(approveTx.hash)}`, 'success');
      txCount++;
      updateStatus();

      log(`Swapping ${amount} WETH to USDC (Tx ${i + 1}/${txCountInput}) for ${wallet.address}...`);
      const swapTx = await dodoContract.connect(signer).mixSwap(
        config.CONTRACT_ADDRESSES.WETH,
        config.CONTRACT_ADDRESSES.USDC,
        swapAmount,
        0,
        0,
        [],
        [],
        [wallet.address],
        0,
        [],
        '0x',
        Math.floor(Date.now() / 1000) + 3600,
        { gasLimit: 300000 }
      );
      await swapTx.wait();
      log(`Swap successful: ${truncateHash(swapTx.hash)}`, 'success');
      txCount++;
      updateStatus();
      if (i < txCountInput - 1) await new Promise((resolve) => setTimeout(resolve, config.delay));
    }
    return true;
  } catch (error) {
    log(`Swap error: ${error.message}`, 'error');
    return false;
  }
}

async function swapUSDCtoWETH(wallet, signer, amount, txCountInput) {
  try {
    const usdcDecimals = await usdcContract.decimals();
    const swapAmount = ethers.parseUnits(amount, usdcDecimals);
    const usdcBalance = await usdcContract.balanceOf(wallet.address);
    if (usdcBalance < swapAmount * BigInt(txCountInput)) {
      log(`Insufficient USDC: ${ethers.formatUnits(usdcBalance, usdcDecimals)} for ${txCountInput} txs`, 'error');
      return false;
    }
    for (let i = 0; i < txCountInput; i++) {
      log(`Approving ${amount} USDC for DODO (Tx ${i + 1}/${txCountInput})...`);
      const approveTx = await usdcContract.connect(signer).approve(
        config.CONTRACT_ADDRESSES.DODOFeeRouteProxy,
        swapAmount,
        { gasLimit: 100000 }
      );
      await approveTx.wait();
      log(`Approval successful: ${truncateHash(approveTx.hash)}`, 'success');
      txCount++;
      updateStatus();

      log(`Swapping ${amount} USDC to WETH (Tx ${i + 1}/${txCountInput}) for ${wallet.address}...`);
      const swapTx = await dodoContract.connect(signer).mixSwap(
        config.CONTRACT_ADDRESSES.USDC,
        config.CONTRACT_ADDRESSES.WETH,
        swapAmount,
        0,
        0,
        [],
        [],
        [wallet.address],
        0,
        [],
        '0x',
        Math.floor(Date.now() / 1000) + 3600,
        { gasLimit: 300000 }
      );
      await swapTx.wait();
      log(`Swap successful: ${truncateHash(swapTx.hash)}`, 'success');
      txCount++;
      updateStatus();
      if (i < txCountInput - 1) await new Promise((resolve) => setTimeout(resolve, config.delay));
    }
    return true;
  } catch (error) {
    log(`Swap error: ${error.message}`, 'error');
    return false;
  }
}

async function swapETHtoUSDC(wallet, signer, amount, txCountInput) {
  try {
    const ethAmount = ethers.parseEther(amount);
    const balance = await provider.getBalance(wallet.address);
    if (balance < ethAmount * BigInt(txCountInput)) {
      log(`Insufficient balance: ${ethers.formatEther(balance)} ETH for ${txCountInput} txs`, 'error');
      return false;
    }
    for (let i = 0; i < txCountInput; i++) {
      log(`Wrapping ${amount} ETH to WETH for swap (Tx ${i + 1}/${txCountInput})...`);
      const wrapTx = await wethContract.connect(signer).deposit(
        { value: ethAmount, gasLimit: 100000 }
      );
      await wrapTx.wait();
      log(`Wrap successful: ${truncateHash(wrapTx.hash)}`, 'success');
      txCount++;
      updateStatus();

      log(`Approving ${amount} WETH for DODO (Tx ${i + 1}/${txCountInput})...`);
      const approveTx = await wethContract.connect(signer).approve(
        config.CONTRACT_ADDRESSES.DODOFeeRouteProxy,
        ethAmount,
        { gasLimit: 100000 }
      );
      await approveTx.wait();
      log(`Approval successful: ${truncateHash(approveTx.hash)}`, 'success');
      txCount++;
      updateStatus();

      log(`Swapping ${amount} WETH to USDC (Tx ${i + 1}/${txCountInput}) for ${wallet.address}...`);
      const swapTx = await dodoContract.connect(signer).mixSwap(
        config.CONTRACT_ADDRESSES.WETH,
        config.CONTRACT_ADDRESSES.USDC,
        ethAmount,
        0,
        0,
        [],
        [],
        [wallet.address],
        0,
        [],
        '0x',
        Math.floor(Date.now() / 1000) + 3600,
        { gasLimit: 300000 }
      );
      await swapTx.wait();
      log(`Swap successful: ${truncateHash(swapTx.hash)}`, 'success');
      txCount++;
      updateStatus();
      if (i < txCountInput - 1) await new Promise((resolve) => setTimeout(resolve, config.delay));
    }
    return true;
  } catch (error) {
    log(`Swap error: ${error.message}`, 'error');
    return false;
  }
}

async function approveWETH(wallet, signer) {
  try {
    const wethBalance = await wethContract.balanceOf(wallet.address);
    if (wethBalance == 0) {
      log(`No WETH to approve`, 'error');
      return false;
    }
    log(`Approving WETH for DODO for ${wallet.address}...`);
    const tx = await wethContract.connect(signer).approve(
      config.CONTRACT_ADDRESSES.DODOFeeRouteProxy,
      wethBalance,
      { gasLimit: 100000 }
    );
    await tx.wait();
    log(`Approval successful: ${truncateHash(tx.hash)}`, 'success');
    txCount++;
    updateStatus();
    return true;
  } catch (error) {
    log(`Approve error: ${error.message}`, 'error');
    return false;
  }
}

async function approveUSDC(wallet, signer) {
  try {
    const usdcDecimals = await usdcContract.decimals();
    const usdcBalance = await usdcContract.balanceOf(wallet.address);
    if (usdcBalance == 0) {
      log(`No USDC to approve`, 'error');
      return false;
    }
    log(`Approving USDC for DODO for ${wallet.address}...`);
    const tx = await usdcContract.connect(signer).approve(
      config.CONTRACT_ADDRESSES.DODOFeeRouteProxy,
      usdcBalance,
      { gasLimit: 100000 }
    );
    await tx.wait();
    log(`Approval successful: ${truncateHash(tx.hash)}`, 'success');
    txCount++;
    updateStatus();
    return true;
  } catch (error) {
    log(`Approve error: ${error.message}`, 'error');
    return false;
  }
}

async function checkBalances(wallet) {
  try {
    const ethBalance = await provider.getBalance(wallet.address);
    const wethBalance = await wethContract.balanceOf(wallet.address);
    const usdcBalance = await usdcContract.balanceOf(wallet.address);
    const usdcDecimals = await usdcContract.decimals();
    log(`Balances for ${wallet.address}:`);
    log(`ETH: ${ethers.formatEther(ethBalance)}`, 'success');
    log(`WETH: ${ethers.formatEther(wethBalance)}`, 'success');
    log(`USDC: ${ethers.formatUnits(usdcBalance, usdcDecimals)}`, 'success');
    return true;
  } catch (error) {
    log(`Balance check error: ${error.message}`, 'error');
    return false;
  }
}

function clearLogs() {
  logBox.setContent('');
  log('Logs cleared', 'success');
}

async function autoAll(wallet, signer, amount) {
  if (autoAllRunning) {
    log('Auto All already running', 'warning');
    return;
  }
  autoAllRunning = true;
  const txCountInput = 1; // Default to 1 transaction per task

  try {
    log('Starting Auto All cycle...', 'success');

    // Task 1: Request Faucet
    log('Executing Request Faucet...');
    await requestFaucet(wallet, signer);
    await new Promise((resolve) => setTimeout(resolve, config.delay));

    // Task 2: Deposit ETH (Gateway)
    log('Executing Deposit ETH (Gateway)...');
    await depositETHGateway(wallet, signer, amount, txCountInput);
    await new Promise((resolve) => setTimeout(resolve, config.delay));

    // Task 3: Withdraw WETH (Gateway)
    log('Executing Withdraw WETH (Gateway)...');
    await withdrawWETHGateway(wallet, signer, amount, txCountInput);
    await new Promise((resolve) => setTimeout(resolve, config.delay));

    // Task 4: Wrap ETH to WETH (Direct)
    log('Executing Wrap ETH to WETH (Direct)...');
    await wrapETHDirect(wallet, signer, amount, txCountInput);
    await new Promise((resolve) => setTimeout(resolve, config.delay));

    // Task 5: Unwrap WETH to ETH (Direct)
    log('Executing Unwrap WETH to ETH (Direct)...');
    await unwrapWETHDirect(wallet, signer, amount, txCountInput);
    await new Promise((resolve) => setTimeout(resolve, config.delay));

    // Task 6: Swap WETH to USDC
    log('Executing Swap WETH to USDC...');
    await swapWETHtoUSDC(wallet, signer, amount, txCountInput);
    await new Promise((resolve) => setTimeout(resolve, config.delay));

    // Task 7: Swap USDC to WETH
    log('Executing Swap USDC to WETH...');
    await swapUSDCtoWETH(wallet, signer, amount, txCountInput);
    await new Promise((resolve) => setTimeout(resolve, config.delay));

    // Task 8: Swap ETH to USDC
    log('Executing Swap ETH to USDC...');
    await swapETHtoUSDC(wallet, signer, amount, txCountInput);
    await new Promise((resolve) => setTimeout(resolve, config.delay));

    // Task 9: Approve WETH
    log('Executing Approve WETH for DODO...');
    await approveWETH(wallet, signer);
    await new Promise((resolve) => setTimeout(resolve, config.delay));

    // Task 10: Approve USDC
    log('Executing Approve USDC for DODO...');
    await approveUSDC(wallet, signer);
    await new Promise((resolve) => setTimeout(resolve, config.delay));

    // Task 11: Check Balances
    log('Executing Check Balances...');
    await checkBalances(wallet);

    log('Auto All cycle complete', 'success');
    const twentyFourHours = 24 * 60 * 60 * 1000;
    log(`Scheduling next cycle in 24 hours...`, 'warning');
    setTimeout(() => {
      log('Restarting Auto All cycle...', 'success');
      autoAll(wallet, signer, amount);
    }, twentyFourHours);
  } catch (error) {
    log(`Auto All error: ${error.message}`, 'error');
  } finally {
    autoAllRunning = false;
    menuBox.focus();
  }
}

// Input handlers
function promptAmount(task, unit, callback) {
  inputBox.setValue('');
  inputBox.label = `{bold}{cyan-fg}Enter ${task} Amount (${unit}){/}`;
  inputBox.hidden = false;
  inputBox.focus();
  screen.render();

  inputBox.once('submit', (value) => {
    inputBox.hidden = true;
    screen.render();
    const amount = parseFloat(value);
    if (isNaN(amount) || amount <= 0) {
      log(`Invalid amount: ${value}`, 'error');
      menuBox.focus();
      return;
    }
    callback(amount.toString());
  });
}

function promptTxCount(task, amount, callback) {
  txCountBox.setValue('');
  txCountBox.label = `{bold}{cyan-fg}Enter Number of ${task} Transactions{/}`;
  txCountBox.hidden = false;
  txCountBox.focus();
  screen.render();

  txCountBox.once('submit', (value) => {
    txCountBox.hidden = true;
    screen.render();
    const count = parseInt(value);
    if (isNaN(count) || count <= 0 || count > 100) {
      log(`Invalid transaction count: ${value} (use 1-100)`, 'error');
      menuBox.focus();
      return;
    }
    callback(amount, count);
  });
}

// Menu handler
menuBox.on('select', async (item, index) => {
  const wallet = new ethers.Wallet(accounts[0].pk, provider);
  const signer = wallet.connect(provider);
  switch (index) {
    case 0: // Request Faucet
      await requestFaucet(wallet, signer);
      menuBox.focus();
      break;
    case 1: // Deposit ETH (Gateway)
      promptAmount('Deposit', 'ETH', (amount) => {
        promptTxCount('Deposit', amount, async (amount, count) => {
          await depositETHGateway(wallet, signer, amount, count);
          menuBox.focus();
        });
      });
      break;
    case 2: // Withdraw WETH (Gateway)
      promptAmount('Withdraw', 'WETH', (amount) => {
        promptTxCount('Withdraw', amount, async (amount, count) => {
          await withdrawWETHGateway(wallet, signer, amount, count);
          menuBox.focus();
        });
      });
      break;
    case 3: // Wrap ETH to WETH (Direct)
      promptAmount('Wrap', 'ETH', (amount) => {
        promptTxCount('Wrap', amount, async (amount, count) => {
          await wrapETHDirect(wallet, signer, amount, count);
          menuBox.focus();
        });
      });
      break;
    case 4: // Unwrap WETH to ETH (Direct)
      promptAmount('Unwrap', 'WETH', (amount) => {
        promptTxCount('Unwrap', amount, async (amount, count) => {
          await unwrapWETHDirect(wallet, signer, amount, count);
          menuBox.focus();
        });
      });
      break;
    case 5: // Swap WETH to USDC
      promptAmount('Swap WETH to USDC', 'WETH', (amount) => {
        promptTxCount('Swap WETH to USDC', amount, async (amount, count) => {
          await swapWETHtoUSDC(wallet, signer, amount, count);
          menuBox.focus();
        });
      });
      break;
    case 6: // Swap USDC to WETH
      promptAmount('Swap USDC to WETH', 'USDC', (amount) => {
        promptTxCount('Swap USDC to WETH', amount, async (amount, count) => {
          await swapUSDCtoWETH(wallet, signer, amount, count);
          menuBox.focus();
        });
      });
      break;
    case 7: // Swap ETH to USDC
      promptAmount('Swap ETH to USDC', 'ETH', (amount) => {
        promptTxCount('Swap ETH to USDC', amount, async (amount, count) => {
          await swapETHtoUSDC(wallet, signer, amount, count);
          menuBox.focus();
        });
      });
      break;
    case 8: // Approve WETH
      await approveWETH(wallet, signer);
      menuBox.focus();
      break;
    case 9: // Approve USDC
      await approveUSDC(wallet, signer);
      menuBox.focus();
      break;
    case 10: // Check Balances
      await checkBalances(wallet);
      menuBox.focus();
      break;
    case 11: // Clear Logs
      clearLogs();
      menuBox.focus();
      break;
    case 12: // Auto All
      promptAmount('Auto All', 'ETH/USDC', async (amount) => {
        await autoAll(wallet, signer, amount);
      });
      break;
    case 13: // Exit
      log('Exiting system...', 'warning');
      setTimeout(() => process.exit(0), 1000);
      break;
  }
});

// Keyboard controls
screen.key(['q', 'Q', 'C-c'], () => {
  log('Exiting system...', 'warning');
  autoAllRunning = false;
  setTimeout(() => process.exit(0), 1000);
});

screen.key(['up', 'down'], () => {
  menuBox.focus();
  screen.render();
});

screen.key(['escape'], () => {
  if (!inputBox.hidden || !txCountBox.hidden) {
    inputBox.hidden = true;
    txCountBox.hidden = true;
    menuBox.focus();
    screen.render();
  }
});

// Start
log('System online', 'success');
updateStatus();
menuBox.focus();
screen.render();
