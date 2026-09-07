#![cfg(test)]
extern crate std;

use soroban_sdk::{
    symbol_short,
    testutils::{storage::Instance as _, Address as _, Events, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, IntoVal, Symbol, Val, Vec,
};

use crate::{
    deadline_reached, Escrow, EscrowClient, TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS,
    TESTNET_INSTANCE_TTL_EXTEND_TO_LEDGERS, TESTNET_SAFE_SETTLEMENT_HORIZON_SECS,
};

// Registers a Stellar Asset Contract (SAC) test token and returns its
// admin client (for minting) and the standard token client.
fn create_token<'a>(
    env: &Env,
    admin: &Address,
) -> (Address, StellarAssetClient<'a>, TokenClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token_address = sac.address();
    (
        token_address.clone(),
        StellarAssetClient::new(env, &token_address),
        TokenClient::new(env, &token_address),
    )
}

// Deploys the escrow contract and returns a typed client.
fn create_escrow(env: &Env) -> EscrowClient<'_> {
    let id = env.register(Escrow, ());
    EscrowClient::new(env, &id)
}

fn bps(env: &Env) -> Vec<u32> {
    Vec::from_array(env, [6000u32, 3000u32, 1000u32])
}

fn valid_deadline(env: &Env) -> u64 {
    env.ledger().timestamp() + 1
}

#[test]
fn initialize_stores_state() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);

    escrow.initialize(
        &organizer,
        &referee,
        &token_addr,
        &1_000_000i128,
        &bps(&env),
        &valid_deadline(&env),
    );

    // get_pool reflects zero players initially.
    assert_eq!(escrow.get_pool(), 0i128);
    assert_eq!(escrow.is_finished(), false);
}

#[test]
fn initialize_accepts_deadline_at_testnet_safe_horizon() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    let deadline = env.ledger().timestamp() + TESTNET_SAFE_SETTLEMENT_HORIZON_SECS;

    escrow.initialize(
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bps(&env),
        &deadline,
    );

    let stored_deadline: Option<u64> = env.as_contract(&escrow.address, || {
        env.storage()
            .instance()
            .get(&crate::DataKey::SettlementDeadline)
    });
    assert_eq!(stored_deadline, Some(deadline));
}

#[test]
fn initialize_extends_insufficient_instance_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    let initial_ttl = env.as_contract(&escrow.address, || env.storage().instance().get_ttl());

    env.ledger().with_mut(|ledger| {
        ledger.sequence_number += initial_ttl - 1;
        ledger.timestamp = 1_000;
    });
    escrow.initialize(
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bps(&env),
        &(1_000 + TESTNET_SAFE_SETTLEMENT_HORIZON_SECS),
    );

    let extended_ttl = env.as_contract(&escrow.address, || env.storage().instance().get_ttl());
    assert_eq!(extended_ttl, TESTNET_INSTANCE_TTL_EXTEND_TO_LEDGERS);
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")] // DeadlineNotFuture
fn initialize_rejects_past_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);

    escrow.initialize(&organizer, &referee, &token_addr, &1i128, &bps(&env), &999);
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")] // DeadlineNotFuture
fn initialize_rejects_equal_time_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);

    escrow.initialize(
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bps(&env),
        &1_000,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")] // DeadlineExceedsTestnetSafeHorizon
fn initialize_rejects_horizon_exceeding_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    let deadline = env.ledger().timestamp() + TESTNET_SAFE_SETTLEMENT_HORIZON_SECS + 1;

    escrow.initialize(
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bps(&env),
        &deadline,
    );
}

#[test]
fn deadline_boundary_is_inclusive() {
    let env = Env::default();
    let deadline = 1_000;

    env.ledger()
        .with_mut(|ledger| ledger.timestamp = deadline - 1);
    assert_eq!(deadline_reached(&env, deadline), false);
    env.ledger().with_mut(|ledger| ledger.timestamp = deadline);
    assert_eq!(deadline_reached(&env, deadline), true);
    env.ledger()
        .with_mut(|ledger| ledger.timestamp = deadline + 1);
    assert_eq!(deadline_reached(&env, deadline), true);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")] // BadDistributionLen
fn initialize_rejects_bad_bps_len() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    let bad = Vec::from_array(&env, [6000u32, 4000u32]); // len 2
    escrow.initialize(
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bad,
        &valid_deadline(&env),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")] // BadDistributionSum
fn initialize_rejects_bad_bps_sum() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    let bad = Vec::from_array(&env, [6000u32, 3000u32, 500u32]); // sum 9500
    escrow.initialize(
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bad,
        &valid_deadline(&env),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")] // NonPositiveEntryFee
fn initialize_rejects_zero_entry_fee() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    escrow.initialize(
        &organizer,
        &referee,
        &token_addr,
        &0i128,
        &bps(&env),
        &valid_deadline(&env),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")] // OrganizerIsReferee
fn initialize_rejects_organizer_equals_referee() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let same = Address::generate(&env);
    let escrow = create_escrow(&env);
    escrow.initialize(
        &same,
        &same,
        &token_addr,
        &1i128,
        &bps(&env),
        &valid_deadline(&env),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // AlreadyInitialized
fn initialize_rejects_double_init() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    escrow.initialize(
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bps(&env),
        &valid_deadline(&env),
    );
    escrow.initialize(
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bps(&env),
        &valid_deadline(&env),
    );
}

#[test]
#[should_panic] // missing auth → AuthError
fn initialize_requires_organizer_auth() {
    let env = Env::default();
    // NOTE: no mock_all_auths(); organizer.require_auth() must fail.
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    escrow.initialize(
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bps(&env),
        &valid_deadline(&env),
    );
}

fn init_default<'a>(
    env: &'a Env,
    escrow: &EscrowClient<'a>,
    token_addr: &Address,
    organizer: &Address,
    referee: &Address,
) {
    escrow.initialize(
        organizer,
        referee,
        token_addr,
        &1_000_000i128,
        &bps(env),
        &valid_deadline(env),
    );
}

#[test]
fn join_transfers_fee_and_records_player() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);

    let player = Address::generate(&env);
    sac.mint(&player, &5_000_000i128); // fund the player

    escrow.join_tournament(&player);

    assert_eq!(escrow.get_pool(), 1_000_000i128);
    // fee left player, sits in contract escrow.
    assert_eq!(token.balance(&player), 4_000_000i128);
    assert_eq!(token.balance(&escrow.address), 1_000_000i128);
}

#[test]
fn join_refreshes_instance_ttl_below_threshold() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);

    env.ledger().with_mut(|ledger| {
        ledger.sequence_number += TESTNET_INSTANCE_TTL_EXTEND_TO_LEDGERS
            - TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS
            + 1;
    });
    let player = Address::generate(&env);
    sac.mint(&player, &5_000_000i128);
    escrow.join_tournament(&player);

    let ttl = env.as_contract(&escrow.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, TESTNET_INSTANCE_TTL_EXTEND_TO_LEDGERS);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")] // AlreadyJoined
fn join_rejects_double_join() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let player = Address::generate(&env);
    sac.mint(&player, &5_000_000i128);
    escrow.join_tournament(&player);
    escrow.join_tournament(&player); // second time → panic
}

fn join<'a>(env: &Env, escrow: &EscrowClient<'a>, sac: &StellarAssetClient<'a>) -> Address {
    let p = Address::generate(env);
    sac.mint(&p, &10_000_000i128);
    escrow.join_tournament(&p);
    p
}

#[test]
fn finalize_pays_60_30_10() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee); // entry_fee 1_000_000

    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    // pool = 3_000_000

    escrow.finalize_results(&p1, &p2, &p3);

    assert_eq!(escrow.is_finished(), true);
    // 60/30/10 of 3_000_000 = 1_800_000 / 900_000 / 300_000
    assert_eq!(token.balance(&p1), 10_000_000 - 1_000_000 + 1_800_000); // 10_800_000
    assert_eq!(token.balance(&p2), 10_000_000 - 1_000_000 + 900_000); // 9_900_000
    assert_eq!(token.balance(&p3), 10_000_000 - 1_000_000 + 300_000); // 9_300_000
    assert_eq!(token.balance(&escrow.address), 0i128); // pool fully distributed
    assert_eq!(escrow.get_reward(&p1), 1_800_000i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")] // WinnersNotDistinct
fn finalize_rejects_duplicate_winner() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let _p3 = join(&env, &escrow, &sac);
    escrow.finalize_results(&p1, &p1, &p2); // dup p1
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")] // WinnerNotRegistered
fn finalize_rejects_unregistered_winner() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let stranger = Address::generate(&env); // never joined
    escrow.finalize_results(&p1, &p2, &stranger);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")] // AlreadyFinished
fn finalize_rejects_double_finalize() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    escrow.finalize_results(&p1, &p2, &p3);
    escrow.finalize_results(&p1, &p2, &p3); // second → panic
}

#[test]
#[should_panic] // unauthorized: only referee may finalize
fn finalize_requires_referee_auth() {
    let env = Env::default();
    // Mint requires SAC admin auth + joins require player auth, so mock for
    // setup, then assert the referee-only guard via mock_auths with a
    // non-referee invoker.
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    // Now restrict auths so referee's require_auth is NOT satisfied.
    env.set_auths(&[]); // clear all mocked auths
    escrow.finalize_results(&p1, &p2, &p3); // referee.require_auth() fails
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")] // AlreadyFinished
fn join_rejects_after_finish() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    escrow.finalize_results(&p1, &p2, &p3);
    let late = Address::generate(&env);
    sac.mint(&late, &5_000_000i128);
    escrow.join_tournament(&late); // finished → panic #7
}

#[test]
fn get_pool_tracks_joins() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee); // fee 1_000_000
    assert_eq!(escrow.get_pool(), 0i128);
    let _a = join(&env, &escrow, &sac);
    assert_eq!(escrow.get_pool(), 1_000_000i128);
    let _b = join(&env, &escrow, &sac);
    assert_eq!(escrow.get_pool(), 2_000_000i128);
}

#[test]
fn get_reward_returns_placement_amounts() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac); // pool 3_000_000

    // Before finalize: zero.
    assert_eq!(escrow.get_reward(&p1), 0i128);

    escrow.finalize_results(&p1, &p2, &p3);
    assert_eq!(escrow.get_reward(&p1), 1_800_000i128);
    assert_eq!(escrow.get_reward(&p2), 900_000i128);
    assert_eq!(escrow.get_reward(&p3), 300_000i128);
    // Non-winner registered player → 0; here all 3 are winners, so use a
    // stranger:
    let stranger = Address::generate(&env);
    assert_eq!(escrow.get_reward(&stranger), 0i128);
}

#[test]
fn is_finished_flips_after_finalize() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    assert_eq!(escrow.is_finished(), false);
    escrow.finalize_results(&p1, &p2, &p3);
    assert_eq!(escrow.is_finished(), true);
}

#[test]
fn cancel_refunds_all_players() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac); // each minted 10_000_000, paid 1_000_000
    let p2 = join(&env, &escrow, &sac);
    assert_eq!(token.balance(&escrow.address), 2_000_000i128);

    escrow.cancel_tournament();

    assert_eq!(token.balance(&p1), 10_000_000i128); // fully refunded
    assert_eq!(token.balance(&p2), 10_000_000i128);
    assert_eq!(token.balance(&escrow.address), 0i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")] // AlreadyCancelled
fn join_rejects_after_cancel() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    escrow.cancel_tournament();
    let player = Address::generate(&env);
    escrow.join_tournament(&player); // cancelled → panic
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")] // AlreadyFinished → no cancel after finalize
fn cancel_rejects_after_finalize() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    escrow.finalize_results(&p1, &p2, &p3);
    escrow.cancel_tournament(); // finished → panic #7
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")] // AlreadyCancelled
fn cancel_rejects_double_cancel() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    escrow.cancel_tournament();
    escrow.cancel_tournament(); // second → panic #8
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")] // AlreadyCancelled → no finalize after cancel
fn finalize_rejects_after_cancel() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    escrow.cancel_tournament();
    escrow.finalize_results(&p1, &p2, &p3); // cancelled → panic #8
}

#[test]
#[should_panic] // unauthorized: only organizer may cancel
fn cancel_requires_organizer_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    env.set_auths(&[]); // clear mocked auths → organizer.require_auth() fails
    escrow.cancel_tournament();
}

#[test]
fn join_emits_registered_event() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let player = Address::generate(&env);
    sac.mint(&player, &5_000_000i128);
    escrow.join_tournament(&player);

    let expected: Vec<(Address, Vec<Val>, Val)> = Vec::from_array(
        &env,
        [(
            escrow.address.clone(),
            Vec::from_array(
                &env,
                [
                    Symbol::new(&env, "registered").into_val(&env),
                    player.into_val(&env),
                ],
            ),
            1_000_000i128.into_val(&env),
        )],
    );
    assert_eq!(
        env.events().all().filter_by_contract(&escrow.address),
        expected
    );
}

#[test]
fn finalize_emits_finalized_event() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    escrow.finalize_results(&p1, &p2, &p3);

    let expected: Vec<(Address, Vec<Val>, Val)> = Vec::from_array(
        &env,
        [(
            escrow.address.clone(),
            Vec::from_array(
                &env,
                [
                    symbol_short!("finalized").into_val(&env),
                    p1.into_val(&env),
                    p2.into_val(&env),
                    p3.into_val(&env),
                ],
            ),
            Vec::from_array(&env, [1_800_000i128, 900_000i128, 300_000i128]).into_val(&env),
        )],
    );
    assert_eq!(
        env.events().all().filter_by_contract(&escrow.address),
        expected
    );
}

#[test]
fn cancel_emits_cancelled_event() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    init_default(&env, &escrow, &token_addr, &organizer, &referee);
    let _p1 = join(&env, &escrow, &sac);
    let _p2 = join(&env, &escrow, &sac);
    escrow.cancel_tournament();

    let expected: Vec<(Address, Vec<Val>, Val)> = Vec::from_array(
        &env,
        [(
            escrow.address.clone(),
            Vec::from_array(&env, [symbol_short!("cancelled").into_val(&env)]),
            2u32.into_val(&env),
        )],
    );
    assert_eq!(
        env.events().all().filter_by_contract(&escrow.address),
        expected
    );
}

#[test]
fn finalize_assigns_dust_to_first_and_conserves_pool() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(&env);
    // entry_fee = 1 (smallest unit), 3 players → pool = 3, indivisible by bps.
    escrow.initialize(
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bps(&env),
        &valid_deadline(&env),
    );

    let p1 = {
        let p = Address::generate(&env);
        sac.mint(&p, &100i128);
        escrow.join_tournament(&p);
        p
    };
    let p2 = {
        let p = Address::generate(&env);
        sac.mint(&p, &100i128);
        escrow.join_tournament(&p);
        p
    };
    let p3 = {
        let p = Address::generate(&env);
        sac.mint(&p, &100i128);
        escrow.join_tournament(&p);
        p
    };

    assert_eq!(escrow.get_pool(), 3i128);
    escrow.finalize_results(&p1, &p2, &p3);

    // floor(3*6000/10000)=1, floor(3*3000/10000)=0, floor(3*1000/10000)=0
    // distributed = 1; dust = 2; 1st = 1+2 = 3.
    let r1 = escrow.get_reward(&p1);
    let r2 = escrow.get_reward(&p2);
    let r3 = escrow.get_reward(&p3);
    assert_eq!(r1, 3i128);
    assert_eq!(r2, 0i128);
    assert_eq!(r3, 0i128);
    // Conservation: payouts sum to pool, escrow fully drained.
    assert_eq!(r1 + r2 + r3, 3i128);
    assert_eq!(token.balance(&escrow.address), 0i128);
    assert_eq!(token.balance(&p1), 100 - 1 + 3); // 102
    assert_eq!(token.balance(&p2), 100 - 1 + 0); // 99
    assert_eq!(token.balance(&p3), 100 - 1 + 0); // 99
}
