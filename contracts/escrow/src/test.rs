#![cfg(test)]
extern crate std;

use soroban_sdk::{
    symbol_short,
    testutils::{
        Address as _, AuthorizedFunction, AuthorizedInvocation, Deployer as _, Events, Ledger,
    },
    token::{StellarAssetClient, TokenClient},
    Address, Env, Event, IntoVal, Symbol, Val, Vec,
};

use crate::{
    deadline_reached, payout_amounts, DataKey, Escrow, EscrowClient, RefundClaimed, MAX_PLAYERS,
    MAX_SETTLEMENT_HORIZON_SECS, MAX_WINNERS, TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS,
    TESTNET_INSTANCE_TTL_EXTEND_TO_LEDGERS, TESTNET_LEDGER_TARGET_SECONDS,
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
fn create_escrow<'a>(
    env: &'a Env,
    organizer: &Address,
    referee: &Address,
    token_addr: &Address,
    entry_fee: &i128,
    distribution_bps: &Vec<u32>,
    settlement_deadline: &u64,
) -> EscrowClient<'a> {
    let id = env.register(
        Escrow,
        (
            organizer,
            referee,
            token_addr,
            entry_fee,
            distribution_bps,
            settlement_deadline,
        ),
    );
    EscrowClient::new(env, &id)
}

fn bps(env: &Env) -> Vec<u32> {
    Vec::from_array(env, [6000u32, 3000u32, 1000u32])
}

fn valid_deadline(env: &Env) -> u64 {
    env.ledger().timestamp() + 1
}

fn contract_ttls(env: &Env, contract: &Address) -> (u32, u32) {
    (
        env.deployer().get_contract_instance_ttl(contract),
        env.deployer().get_contract_code_ttl(contract),
    )
}

fn advance_ledgers(env: &Env, ledgers: u32) {
    env.ledger().with_mut(|ledger| {
        ledger.sequence_number += ledgers;
        ledger.timestamp += u64::from(ledgers) * TESTNET_LEDGER_TARGET_SECONDS;
    });
}

fn age_contract_to(env: &Env, contract: &Address, remaining_ttl: u32) {
    let current_ttl = env.deployer().get_contract_instance_ttl(contract);
    assert!(current_ttl > remaining_ttl);
    advance_ledgers(env, current_ttl - remaining_ttl);
}

fn assert_contract_ttls_extended(env: &Env, contract: &Address) {
    let (instance_ttl, code_ttl) = contract_ttls(env, contract);
    assert_eq!(instance_ttl, TESTNET_INSTANCE_TTL_EXTEND_TO_LEDGERS);
    assert!(code_ttl >= TESTNET_INSTANCE_TTL_EXTEND_TO_LEDGERS);
}

fn assert_single_contract_auth(
    env: &Env,
    signer: &Address,
    contract: &Address,
    function: &str,
    args: Vec<Val>,
) {
    assert_eq!(
        env.auths(),
        [(
            signer.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    contract.clone(),
                    Symbol::new(env, function),
                    args,
                )),
                sub_invocations: std::vec![],
            },
        )],
    );
}

#[test]
fn constructor_stores_state() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);

    let escrow = create_escrow(
        &env,
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
    assert!(escrow.get_players().is_empty());
    let info = escrow.get_tournament();
    assert_eq!(info.organizer, organizer);
    assert_eq!(info.referee, referee);
    assert_eq!(info.token, token_addr);
    assert_eq!(info.entry_fee, 1_000_000);
    assert_eq!(info.distribution_bps, bps(&env));
    assert_eq!(info.settlement_deadline, valid_deadline(&env));
    assert_eq!(info.player_count, 0);
    assert!(!info.finished);
    assert!(!info.cancelled);
    assert!(info.winners.is_empty());
}

#[test]
fn constructor_accepts_one_and_ten_winner_distributions() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    for distribution in [
        Vec::from_array(&env, [10_000u32]),
        Vec::from_array(&env, [1_000u32; MAX_WINNERS as usize]),
    ] {
        let escrow = create_escrow(
            &env,
            &organizer,
            &referee,
            &token_addr,
            &1i128,
            &distribution,
            &valid_deadline(&env),
        );
        assert_eq!(escrow.get_tournament().distribution_bps, distribution);
    }
}

#[test]
fn constructor_accepts_deadline_at_max_horizon() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let deadline = env.ledger().timestamp() + MAX_SETTLEMENT_HORIZON_SECS;

    let escrow = create_escrow(
        &env,
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
fn constructor_extends_instance_and_code_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let escrow = create_escrow(
        &env,
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bps(&env),
        &(1_000 + MAX_SETTLEMENT_HORIZON_SECS),
    );

    assert_contract_ttls_extended(&env, &escrow.address);
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")] // DeadlineNotFuture
fn constructor_rejects_past_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);

    let escrow = create_escrow(
        &env,
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bps(&env),
        &999,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")] // DeadlineNotFuture
fn constructor_rejects_equal_time_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);

    let escrow = create_escrow(
        &env,
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
fn constructor_rejects_horizon_exceeding_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let deadline = env.ledger().timestamp() + MAX_SETTLEMENT_HORIZON_SECS + 1;

    let escrow = create_escrow(
        &env,
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
fn constructor_rejects_empty_bps() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let bad = Vec::<u32>::new(&env);
    let escrow = create_escrow(
        &env,
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
fn constructor_rejects_bad_bps_sum() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let bad = Vec::from_array(&env, [6000u32, 3000u32, 500u32]); // sum 9500
    let escrow = create_escrow(
        &env,
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
fn constructor_rejects_zero_entry_fee() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(
        &env,
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
fn constructor_rejects_organizer_equals_referee() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let same = Address::generate(&env);
    let escrow = create_escrow(
        &env,
        &same,
        &same,
        &token_addr,
        &1i128,
        &bps(&env),
        &valid_deadline(&env),
    );
}

#[test]
#[should_panic] // missing auth → AuthError
fn constructor_requires_organizer_auth() {
    let env = Env::default();
    // NOTE: no mock_all_auths(); organizer.require_auth() must fail.
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(
        &env,
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bps(&env),
        &valid_deadline(&env),
    );
}

#[test]
fn failed_constructor_rolls_back_deployment() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let id = Address::generate(&env);

    let failure = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        env.register_at(
            &id,
            Escrow,
            (
                &organizer,
                &referee,
                &token_addr,
                &0i128,
                &bps(&env),
                &valid_deadline(&env),
            ),
        );
    }));
    assert!(failure.is_err());
    assert_eq!(EscrowClient::new(&env, &id).get_settlement_deadline(), None);

    env.register_at(
        &id,
        Escrow,
        (
            &organizer,
            &referee,
            &token_addr,
            &1i128,
            &bps(&env),
            &valid_deadline(&env),
        ),
    );
    assert_eq!(
        EscrowClient::new(&env, &id).get_settlement_deadline(),
        Some(1)
    );
}

#[test]
fn legacy_initialize_entrypoint_is_absent() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let before = escrow.get_settlement_deadline();
    let args = Vec::from_array(
        &env,
        [
            organizer.into_val(&env),
            referee.into_val(&env),
            token_addr.into_val(&env),
            1i128.into_val(&env),
            bps(&env).into_val(&env),
            valid_deadline(&env).into_val(&env),
        ],
    );
    assert!(env
        .try_invoke_contract::<(), crate::Error>(
            &escrow.address,
            &Symbol::new(&env, "initialize"),
            args
        )
        .is_err());
    assert_eq!(escrow.get_settlement_deadline(), before);
}

fn init_default<'a>(
    env: &'a Env,
    token_addr: &Address,
    organizer: &Address,
    referee: &Address,
) -> EscrowClient<'a> {
    create_escrow(
        env,
        organizer,
        referee,
        token_addr,
        &1_000_000i128,
        &bps(env),
        &valid_deadline(env),
    )
}

fn init_with_deadline<'a>(
    env: &'a Env,
    token_addr: &Address,
    organizer: &Address,
    referee: &Address,
    deadline: u64,
) -> EscrowClient<'a> {
    create_escrow(
        env,
        organizer,
        referee,
        token_addr,
        &1_000_000i128,
        &bps(env),
        &deadline,
    )
}

#[test]
fn first_join_succeeds_immediately_after_constructor() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);

    let player = Address::generate(&env);
    sac.mint(&player, &5_000_000i128); // fund the player

    escrow.join_tournament(&player);

    assert_eq!(escrow.get_pool(), 1_000_000i128);
    // fee left player, sits in contract escrow.
    assert_eq!(token.balance(&player), 4_000_000i128);
    assert_eq!(token.balance(&escrow.address), 1_000_000i128);
}

#[test]
fn constructor_requires_organizer_authorization() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);

    let escrow = create_escrow(
        &env,
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &bps(&env),
        &valid_deadline(&env),
    );

    assert_single_contract_auth(
        &env,
        &organizer,
        &escrow.address,
        "__constructor",
        (
            &organizer,
            &referee,
            &token_addr,
            1i128,
            bps(&env),
            valid_deadline(&env),
        )
            .into_val(&env),
    );
}

#[test]
fn join_requires_exact_player_authorization() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let player = Address::generate(&env);
    sac.mint(&player, &1_000_000i128);

    escrow.join_tournament(&player);

    assert_eq!(
        env.auths(),
        [(
            player.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    escrow.address.clone(),
                    Symbol::new(&env, "join_tournament"),
                    (&player,).into_val(&env),
                )),
                sub_invocations: std::vec![AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        token_addr,
                        Symbol::new(&env, "transfer"),
                        (&player, &escrow.address, 1_000_000i128).into_val(&env),
                    )),
                    sub_invocations: std::vec![],
                }],
            },
        )],
    );
}

#[test]
fn failed_join_transfer_rolls_back_registration() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let player = Address::generate(&env);

    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        escrow.join_tournament(&player);
    }))
    .is_err());

    assert!(escrow.get_players().is_empty());
    assert_eq!(escrow.get_tournament().player_count, 0);
    assert_eq!(token.balance(&escrow.address), 0);
    let registered: bool = env.as_contract(&escrow.address, || {
        env.storage()
            .instance()
            .has(&DataKey::Registered(player.clone()))
    });
    assert!(!registered);
}

#[test]
fn join_ttl_threshold_is_noop_and_one_below_extends() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let deadline = env.ledger().timestamp() + MAX_SETTLEMENT_HORIZON_SECS;
    let escrow = init_with_deadline(&env, &token_addr, &organizer, &referee, deadline);

    age_contract_to(
        &env,
        &escrow.address,
        TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS,
    );
    let first = Address::generate(&env);
    sac.mint(&first, &5_000_000i128);
    escrow.join_tournament(&first);
    assert_eq!(
        contract_ttls(&env, &escrow.address).0,
        TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS,
    );

    advance_ledgers(&env, 1);
    let ttl_before_failure = contract_ttls(&env, &escrow.address);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        escrow.join_tournament(&first);
    }))
    .is_err());
    assert_eq!(contract_ttls(&env, &escrow.address), ttl_before_failure);
    assert_eq!(escrow.get_players(), Vec::from_array(&env, [first]));

    let second = Address::generate(&env);
    sac.mint(&second, &5_000_000i128);
    escrow.join_tournament(&second);
    assert_contract_ttls_extended(&env, &escrow.address);
}

#[test]
fn finalize_extends_instance_and_code_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let deadline = env.ledger().timestamp() + MAX_SETTLEMENT_HORIZON_SECS;
    let escrow = init_with_deadline(&env, &token_addr, &organizer, &referee, deadline);
    let winners = Vec::from_array(
        &env,
        [
            join(&env, &escrow, &sac),
            join(&env, &escrow, &sac),
            join(&env, &escrow, &sac),
        ],
    );
    age_contract_to(
        &env,
        &escrow.address,
        TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS - 1,
    );

    escrow.finalize_results(&winners);

    assert_contract_ttls_extended(&env, &escrow.address);
}

#[test]
fn cancel_and_refund_extend_instance_and_code_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let deadline = env.ledger().timestamp() + MAX_SETTLEMENT_HORIZON_SECS;
    let escrow = init_with_deadline(&env, &token_addr, &organizer, &referee, deadline);
    let player = join(&env, &escrow, &sac);
    age_contract_to(
        &env,
        &escrow.address,
        TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS - 1,
    );

    escrow.cancel_tournament();
    assert_contract_ttls_extended(&env, &escrow.address);

    age_contract_to(
        &env,
        &escrow.address,
        TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS - 1,
    );
    escrow.claim_refund(&player);
    assert_contract_ttls_extended(&env, &escrow.address);
}

#[test]
fn max_deadline_remains_live_through_ledger_progression() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let deadline = env.ledger().timestamp() + MAX_SETTLEMENT_HORIZON_SECS;
    let escrow = init_with_deadline(&env, &token_addr, &organizer, &referee, deadline);
    let player = join(&env, &escrow, &sac);

    advance_ledgers(
        &env,
        (MAX_SETTLEMENT_HORIZON_SECS / TESTNET_LEDGER_TARGET_SECONDS) as u32,
    );
    assert_eq!(env.ledger().timestamp(), deadline);
    let ttl_before_read = contract_ttls(&env, &escrow.address);
    assert_eq!(escrow.get_tournament().settlement_deadline, deadline);
    assert_eq!(contract_ttls(&env, &escrow.address), ttl_before_read);

    escrow.claim_refund(&player);

    assert_eq!(token.balance(&player), 10_000_000);
    assert_contract_ttls_extended(&env, &escrow.address);
}

#[test]
fn reads_remain_available_near_archive_without_extending_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    age_contract_to(&env, &escrow.address, 1);
    let ttl_before_reads = contract_ttls(&env, &escrow.address);

    assert!(escrow.get_players().is_empty());
    assert_eq!(escrow.get_tournament().organizer, organizer);

    assert_eq!(contract_ttls(&env, &escrow.address), ttl_before_reads);
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
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
#[should_panic(expected = "Error(Contract, #2)")]
fn constructor_rejects_more_than_ten_bps() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    create_escrow(
        &env,
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &Vec::from_array(&env, [1u32; 11]),
        &valid_deadline(&env),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #21)")]
fn constructor_rejects_zero_bps() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    create_escrow(
        &env,
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &Vec::from_array(&env, [10_000u32, 0u32]),
        &valid_deadline(&env),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #21)")]
fn constructor_rejects_bps_over_ten_thousand() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    create_escrow(
        &env,
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &Vec::from_array(&env, [10_001u32]),
        &valid_deadline(&env),
    );
}

fn finalize_three(
    env: &Env,
    escrow: &EscrowClient<'_>,
    first: &Address,
    second: &Address,
    third: &Address,
) {
    escrow.finalize_results(&Vec::from_array(
        env,
        [first.clone(), second.clone(), third.clone()],
    ));
}

#[test]
fn finalize_pays_60_30_10() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee); // entry_fee 1_000_000

    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    // pool = 3_000_000
    let pool = escrow.get_pool();

    finalize_three(&env, &escrow, &p1, &p2, &p3);

    assert_eq!(escrow.is_finished(), true);
    // 60/30/10 of 3_000_000 = 1_800_000 / 900_000 / 300_000
    assert_eq!(token.balance(&p1), 10_000_000 - 1_000_000 + 1_800_000); // 10_800_000
    assert_eq!(token.balance(&p2), 10_000_000 - 1_000_000 + 900_000); // 9_900_000
    assert_eq!(token.balance(&p3), 10_000_000 - 1_000_000 + 300_000); // 9_300_000
    assert_eq!(token.balance(&escrow.address), 0i128); // pool fully distributed
    assert_eq!(escrow.get_reward(&p1), 1_800_000i128);
    assert_eq!(
        pool,
        escrow.get_reward(&p1) + escrow.get_reward(&p2) + escrow.get_reward(&p3)
    );
}

#[test]
fn finalize_requires_exact_referee_authorization() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let winners = Vec::from_array(
        &env,
        [
            join(&env, &escrow, &sac),
            join(&env, &escrow, &sac),
            join(&env, &escrow, &sac),
        ],
    );

    escrow.finalize_results(&winners);

    assert_single_contract_auth(
        &env,
        &referee,
        &escrow.address,
        "finalize_results",
        (&winners,).into_val(&env),
    );
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let _p3 = join(&env, &escrow, &sac);
    finalize_three(&env, &escrow, &p1, &p1, &p2); // dup p1
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let stranger = Address::generate(&env); // never joined
    finalize_three(&env, &escrow, &p1, &p2, &stranger);
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    finalize_three(&env, &escrow, &p1, &p2, &p3);
    finalize_three(&env, &escrow, &p1, &p2, &p3); // second → panic
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    // Now restrict auths so referee's require_auth is NOT satisfied.
    env.set_auths(&[]); // clear all mocked auths
    finalize_three(&env, &escrow, &p1, &p2, &p3); // referee.require_auth() fails
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    finalize_three(&env, &escrow, &p1, &p2, &p3);
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee); // fee 1_000_000
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac); // pool 3_000_000

    // Before finalize: zero.
    assert_eq!(escrow.get_reward(&p1), 0i128);

    finalize_three(&env, &escrow, &p1, &p2, &p3);
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    assert_eq!(escrow.is_finished(), false);
    finalize_three(&env, &escrow, &p1, &p2, &p3);
    assert_eq!(escrow.is_finished(), true);
}

#[test]
fn cancellation_transitions_without_batch_refunds() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac); // each minted 10_000_000, paid 1_000_000
    let p2 = join(&env, &escrow, &sac);
    assert_eq!(token.balance(&escrow.address), 2_000_000i128);

    escrow.cancel_tournament();

    assert_eq!(token.balance(&p1), 9_000_000i128);
    assert_eq!(token.balance(&p2), 9_000_000i128);
    assert_eq!(token.balance(&escrow.address), 2_000_000i128);
}

#[test]
fn cancel_requires_exact_organizer_authorization() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);

    escrow.cancel_tournament();

    assert_single_contract_auth(
        &env,
        &organizer,
        &escrow.address,
        "cancel_tournament",
        ().into_val(&env),
    );
}

#[test]
fn reads_the_initialized_settlement_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);

    let escrow = init_with_deadline(&env, &token_addr, &organizer, &referee, 1_001);

    assert_eq!(escrow.get_settlement_deadline(), Some(1_001));
}

#[test]
fn join_accepts_testnet_simulated_max_players() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);

    let mut expected = Vec::new(&env);
    for _ in 0..MAX_PLAYERS {
        expected.push_back(join(&env, &escrow, &sac));
    }

    assert_eq!(escrow.get_pool(), MAX_PLAYERS as i128 * 1_000_000);
    assert_eq!(escrow.get_players(), expected);
    assert_eq!(escrow.get_tournament().player_count, MAX_PLAYERS);
}

#[test]
#[should_panic(expected = "Error(Contract, #17)")] // MaxPlayersReached
fn join_rejects_testnet_simulated_player_limit() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);

    for _ in 0..MAX_PLAYERS {
        join(&env, &escrow, &sac);
    }
    join(&env, &escrow, &sac);
}

#[test]
fn arbitrary_caller_claims_cancelled_player_refund() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let player = join(&env, &escrow, &sac);
    escrow.cancel_tournament();

    env.set_auths(&[]);
    escrow.claim_refund(&player);

    assert!(env.auths().is_empty());
    assert_eq!(token.balance(&player), 10_000_000i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #18)")] // DeadlineReached
fn join_rejects_at_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_with_deadline(&env, &token_addr, &organizer, &referee, 1_001);
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_001);
    join(&env, &escrow, &sac);
}

#[test]
#[should_panic(expected = "Error(Contract, #18)")] // DeadlineReached
fn finalize_rejects_at_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_with_deadline(&env, &token_addr, &organizer, &referee, 1_001);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_001);
    finalize_three(&env, &escrow, &p1, &p2, &p3);
}

#[test]
#[should_panic(expected = "Error(Contract, #18)")] // DeadlineReached
fn cancel_rejects_at_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_with_deadline(&env, &token_addr, &organizer, &referee, 1_001);
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_001);
    escrow.cancel_tournament();
}

#[test]
#[should_panic(expected = "Error(Contract, #14)")] // DeadlineNotReached
fn refund_rejects_before_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_with_deadline(&env, &token_addr, &organizer, &referee, 1_001);
    let player = join(&env, &escrow, &sac);
    escrow.claim_refund(&player);
}

#[test]
fn refund_succeeds_at_deadline_and_conserves_pool() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_with_deadline(&env, &token_addr, &organizer, &referee, 1_001);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_001);

    escrow.claim_refund(&p1);
    assert_eq!(escrow.get_pool(), 2_000_000i128);
    escrow.claim_refund(&p2);
    escrow.claim_refund(&p3);

    assert_eq!(token.balance(&p1), 10_000_000i128);
    assert_eq!(token.balance(&p2), 10_000_000i128);
    assert_eq!(token.balance(&p3), 10_000_000i128);
    assert_eq!(token.balance(&escrow.address), 0i128);
    assert_eq!(escrow.get_pool(), 0i128);
}

#[test]
fn refund_succeeds_after_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_with_deadline(&env, &token_addr, &organizer, &referee, 1_001);
    let player = join(&env, &escrow, &sac);
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_002);

    escrow.claim_refund(&player);

    assert_eq!(token.balance(&player), 10_000_000i128);
    assert_eq!(escrow.get_pool(), 0i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #15)")] // PlayerNotRegistered
fn refund_rejects_unknown_player() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_with_deadline(&env, &token_addr, &organizer, &referee, 1_001);
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_001);
    escrow.claim_refund(&Address::generate(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #16)")] // RefundAlreadyClaimed
fn refund_rejects_duplicate_claim() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let player = join(&env, &escrow, &sac);
    escrow.cancel_tournament();
    escrow.claim_refund(&player);
    escrow.claim_refund(&player);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")] // AlreadyFinished
fn refund_rejects_finalized_tournament() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    finalize_three(&env, &escrow, &p1, &p2, &p3);
    escrow.claim_refund(&p1);
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    finalize_three(&env, &escrow, &p1, &p2, &p3);
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    escrow.cancel_tournament();
    finalize_three(&env, &escrow, &p1, &p2, &p3); // cancelled → panic #8
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let p1 = join(&env, &escrow, &sac);
    let p2 = join(&env, &escrow, &sac);
    let p3 = join(&env, &escrow, &sac);
    finalize_three(&env, &escrow, &p1, &p2, &p3);

    let expected: Vec<(Address, Vec<Val>, Val)> = Vec::from_array(
        &env,
        [(
            escrow.address.clone(),
            Vec::from_array(&env, [symbol_short!("finalized").into_val(&env)]),
            (
                Vec::from_array(&env, [p1, p2, p3]),
                Vec::from_array(&env, [1_800_000i128, 900_000i128, 300_000i128]),
            )
                .into_val(&env),
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
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
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
fn refund_emits_exact_player_and_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let player = join(&env, &escrow, &sac);
    escrow.cancel_tournament();
    escrow.claim_refund(&player);

    assert_eq!(
        env.events().all().filter_by_contract(&escrow.address),
        std::vec![RefundClaimed {
            player,
            amount: 1_000_000i128,
        }
        .to_xdr(&env, &escrow.address),],
    );
}

#[test]
fn failed_refund_transfer_does_not_mark_claimed() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let player = join(&env, &escrow, &sac);
    escrow.cancel_tournament();
    let recipient = Address::generate(&env);
    env.as_contract(&escrow.address, || {
        TokenClient::new(&env, &token_addr).transfer(&escrow.address, &recipient, &1_000_000i128);
    });

    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        escrow.claim_refund(&player);
    }))
    .is_err());
    let claimed: bool = env.as_contract(&escrow.address, || {
        env.storage()
            .instance()
            .has(&DataKey::RefundClaimed(player.clone()))
    });
    assert!(!claimed);
}

#[test]
fn finalize_assigns_dust_to_first_and_conserves_pool() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    // entry_fee = 1 (smallest unit), 3 players → pool = 3, indivisible by bps.
    let escrow = create_escrow(
        &env,
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
    finalize_three(&env, &escrow, &p1, &p2, &p3);

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

#[test]
fn finalize_one_winner_receives_entire_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(
        &env,
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &Vec::from_array(&env, [10_000u32]),
        &valid_deadline(&env),
    );
    let winner = join(&env, &escrow, &sac);
    sac.mint(&escrow.address, &2i128);
    assert_eq!(escrow.get_pool(), 3);

    escrow.finalize_results(&Vec::from_array(&env, [winner.clone()]));

    assert_eq!(escrow.get_reward(&winner), 3);
    assert_eq!(token.balance(&escrow.address), 0);
    assert_eq!(
        escrow.get_tournament().winners,
        Vec::from_array(&env, [winner])
    );
}

#[test]
fn five_winner_payout_distributes_pool_and_dust() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let bps = Vec::from_array(&env, [4_000u32, 2_500, 1_500, 1_000, 1_000]);
    let escrow = create_escrow(
        &env,
        &organizer,
        &referee,
        &token_addr,
        &1_000_003i128,
        &bps,
        &valid_deadline(&env),
    );
    let mut winners = Vec::new(&env);
    for _ in 0..5 {
        winners.push_back(join(&env, &escrow, &sac));
    }
    assert_eq!(escrow.get_pool(), 5_000_015);

    escrow.finalize_results(&winners);

    let expected = Vec::from_array(&env, [2_000_008i128, 1_250_003, 750_002, 500_001, 500_001]);
    let mut total = 0i128;
    for i in 0..5 {
        let winner = winners.get(i).unwrap();
        let amount = expected.get(i).unwrap();
        assert_eq!(escrow.get_reward(&winner), amount);
        assert_eq!(token.balance(&winner), 10_000_000 - 1_000_003 + amount);
        total = total.checked_add(amount).unwrap();
    }
    assert_eq!(total, 5_000_015);
    assert_eq!(escrow.get_pool(), 0);
    let info = escrow.get_tournament();
    assert!(info.finished);
    assert_eq!(info.winners, winners);
    assert_eq!(info.player_count, 5);
}

#[test]
fn finalize_accepts_ten_winners() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = create_escrow(
        &env,
        &organizer,
        &referee,
        &token_addr,
        &1i128,
        &Vec::from_array(&env, [1_000u32; 10]),
        &valid_deadline(&env),
    );
    let mut winners = Vec::new(&env);
    for _ in 0..10 {
        winners.push_back(join(&env, &escrow, &sac));
    }

    escrow.finalize_results(&winners);

    assert_eq!(escrow.get_pool(), 0);
    assert_eq!(escrow.get_tournament().winners, winners);
    for winner in winners.iter() {
        assert_eq!(escrow.get_reward(&winner), 1);
    }
}

#[test]
#[should_panic(expected = "Error(Contract, #19)")]
fn finalize_rejects_empty_winners() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    escrow.finalize_results(&Vec::<Address>::new(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #19)")]
fn finalize_rejects_more_than_ten_winners() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, _sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let mut winners = Vec::new(&env);
    for _ in 0..11 {
        winners.push_back(organizer.clone());
    }
    escrow.finalize_results(&winners);
}

#[test]
#[should_panic(expected = "Error(Contract, #20)")]
fn finalize_rejects_winner_count_mismatch() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let (token_addr, sac, _token) = create_token(&env, &admin);
    let organizer = Address::generate(&env);
    let referee = Address::generate(&env);
    let escrow = init_default(&env, &token_addr, &organizer, &referee);
    let winners = Vec::from_array(&env, [join(&env, &escrow, &sac), join(&env, &escrow, &sac)]);
    escrow.finalize_results(&winners);
}

#[test]
fn payout_arithmetic_conserves_extreme_and_small_pools_for_every_winner_count() {
    let env = Env::default();
    for n in 1..=MAX_WINNERS {
        let base = 10_000 / n;
        let mut bps = Vec::new(&env);
        for rank in 0..n {
            bps.push_back(base + if rank == 0 { 10_000 % n } else { 0 });
        }
        for pool in [0i128, 1, 3, 9_999, 10_000, 1_000_003, i128::MAX] {
            let amounts = payout_amounts(&env, pool, &bps);
            let mut sum = 0i128;
            for rank in 0..n {
                let amount = amounts.get(rank).unwrap();
                assert!(amount >= 0);
                if rank > 0 {
                    let b = i128::from(bps.get(rank).unwrap());
                    let floor = (pool / 10_000) * b + ((pool % 10_000) * b / 10_000);
                    assert_eq!(amount, floor);
                }
                sum = sum.checked_add(amount).unwrap();
            }
            assert_eq!(sum, pool);
        }
    }
}

#[test]
#[should_panic(expected = "Error(Contract, #22)")]
fn payout_rejects_negative_pool() {
    let env = Env::default();
    payout_amounts(&env, -1, &Vec::from_array(&env, [10_000u32]));
}
