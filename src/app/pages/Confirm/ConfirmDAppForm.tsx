import React, { FC, Fragment, memo, useCallback, useMemo, useState } from 'react';

import classNames from 'clsx';

import Alert from 'app/atoms/Alert';
import ConfirmLedgerOverlay from 'app/atoms/ConfirmLedgerOverlay';
import FormSecondaryButton from 'app/atoms/FormSecondaryButton';
import FormSubmitButton from 'app/atoms/FormSubmitButton';
import Name from 'app/atoms/Name';
import SubTitle from 'app/atoms/SubTitle';
import DAppLogo from 'app/templates//DAppLogo';
import { ModifyFeeAndLimit } from 'app/templates//ExpensesView';
import NetworkBanner from 'app/templates//NetworkBanner';
import AccountBanner from 'app/templates/AccountBanner';
import ConnectBanner from 'app/templates/ConnectBanner';
import { CustomRpsContext } from 'lib/analytics';
import { T, t } from 'lib/i18n/react';
import { useRetryableSWR } from 'lib/swr';
import {
  TempleAccount,
  TempleAccountType,
  TempleDAppPayload,
  useAccount,
  useRelevantAccounts,
  useTempleClient
} from 'lib/temple/front';
import useSafeState from 'lib/ui/useSafeState';
import { useLocation } from 'lib/woozie';

import { ConfirmPageSelectors } from './ConfirmPage.selectors';
import PayloadContent from './PayloadContent';

// TODO: remove operations stuff
const ConfirmDAppForm: FC = () => {
  const { getDAppPayload, confirmDAppPermission, confirmDAppOperation, confirmDAppSign } = useTempleClient();
  const allAccounts = useRelevantAccounts(false);
  const account = useAccount();

  const [accountPkhToConnect, setAccountPkhToConnect] = useState(account.publicKeyHash);

  const loc = useLocation();
  const id = useMemo(() => {
    const usp = new URLSearchParams(loc.search);
    const pageId = usp.get('id');
    if (!pageId) {
      throw new Error(t('notIdentified'));
    }
    return pageId;
  }, [loc.search]);

  const { data } = useRetryableSWR<TempleDAppPayload>([id], getDAppPayload, {
    suspense: true,
    shouldRetryOnError: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });
  const payload = data!;

  const connectedAccount = useMemo(
    () =>
      allAccounts.find(a => a.publicKeyHash === (payload.type === 'connect' ? accountPkhToConnect : payload.sourcePkh)),
    [payload, allAccounts, accountPkhToConnect]
  );

  const onConfirm = useCallback(
    async (confimed: boolean, modifiedTotalFee?: number, modifiedStorageLimit?: number) => {
      switch (payload.type) {
        case 'connect':
          return confirmDAppPermission(id, confimed, accountPkhToConnect);

        case 'confirm_operations':
          return confirmDAppOperation(id, confimed, modifiedTotalFee, modifiedStorageLimit);

        case 'sign':
          return confirmDAppSign(id, confimed);
      }
    },
    [id, payload.type, confirmDAppPermission, confirmDAppOperation, confirmDAppSign, accountPkhToConnect]
  );

  const [error, setError] = useSafeState<any>(null);
  const [confirming, setConfirming] = useSafeState(false);
  const [declining, setDeclining] = useSafeState(false);

  const revealFee = useMemo(() => {
    if (
      payload.type === 'confirm_operations' &&
      payload.estimates &&
      payload.estimates.length === payload.opParams.length + 1
    ) {
      return payload.estimates[0].suggestedFeeMutez;
    }

    return 0;
  }, [payload]);

  const [modifiedTotalFeeValue, setModifiedTotalFeeValue] = useSafeState(
    (payload.type === 'confirm_operations' &&
      payload.opParams.reduce((sum, op) => sum + (op.fee ? +op.fee : 0), 0) + revealFee) ||
      0
  );
  const [modifiedStorageLimitValue, setModifiedStorageLimitValue] = useSafeState(
    (payload.type === 'confirm_operations' && payload.opParams[0].storageLimit) || 0
  );

  const confirm = useCallback(
    async (confirmed: boolean) => {
      setError(null);
      try {
        await onConfirm(confirmed, modifiedTotalFeeValue - revealFee, modifiedStorageLimitValue);
      } catch (err: any) {
        console.error(err);

        // Human delay.
        await new Promise(res => setTimeout(res, 300));
        setError(err);
      }
    },
    [onConfirm, setError, modifiedTotalFeeValue, modifiedStorageLimitValue, revealFee]
  );

  const handleConfirmClick = useCallback(async () => {
    if (confirming || declining) return;

    setConfirming(true);
    await confirm(true);
    setConfirming(false);
  }, [confirming, declining, setConfirming, confirm]);

  const handleDeclineClick = useCallback(async () => {
    if (confirming || declining) return;

    setDeclining(true);
    await confirm(false);
    setDeclining(false);
  }, [confirming, declining, setDeclining, confirm]);

  const handleErrorAlertClose = useCallback(() => setError(null), [setError]);

  const content = useMemo(() => {
    switch (payload.type) {
      case 'connect':
        return {
          title: t('confirmAction', t('connection').toLowerCase()),
          declineActionTitle: t('cancel'),
          declineActionTestID: ConfirmPageSelectors.ConnectAction_CancelButton,
          confirmActionTitle: error ? t('retry') : t('connect'),
          confirmActionTestID: error
            ? ConfirmPageSelectors.ConnectAction_RetryButton
            : ConfirmPageSelectors.ConnectAction_ConnectButton,
          want: (
            <T
              id="appWouldLikeToConnectToYourWallet"
              substitutions={[
                <Fragment key="appName">
                  <span className="font-semibold">{payload.origin}</span>
                  <br />
                </Fragment>
              ]}
            >
              {message => <p className="mb-2 text-sm text-center text-gray-700">{message}</p>}
            </T>
          )
        };

      case 'confirm_operations':
        return {
          title: t('confirmAction', t('operations').toLowerCase()),
          declineActionTitle: t('reject'),
          declineActionTestID: ConfirmPageSelectors.ConfirmOperationsAction_RejectButton,
          confirmActionTitle: error ? t('retry') : t('confirm'),
          confirmActionTestID: error
            ? ConfirmPageSelectors.ConfirmOperationsAction_RetryButton
            : ConfirmPageSelectors.ConfirmOperationsAction_ConfirmButton,
          want: (
            <div className={classNames('mb-2 text-sm text-center text-gray-700', 'flex flex-col items-center')}>
              <div className="flex items-center justify-center">
                <DAppLogo origin={payload.origin} size={16} className="mr-1" />
                <Name className="font-semibold" style={{ maxWidth: '10rem' }}>
                  {payload.appMeta.name}
                </Name>
              </div>
              <T
                id="appRequestOperationToYou"
                substitutions={[
                  <Name className="max-w-full text-xs italic" key="origin">
                    {payload.origin}
                  </Name>
                ]}
              />
            </div>
          )
        };

      case 'sign':
        return {
          title: t('confirmAction', t('signAction').toLowerCase()),
          declineActionTitle: t('reject'),
          declineActionTestID: ConfirmPageSelectors.SignAction_RejectButton,
          confirmActionTitle: t('signAction'),
          confirmActionTestID: ConfirmPageSelectors.SignAction_SignButton,
          want: (
            <div className={classNames('mb-2 text-sm text-center text-gray-700', 'flex flex-col items-center')}>
              <div className="flex items-center justify-center">
                <DAppLogo origin={payload.origin} size={16} className="mr-1" />
                <Name className="font-semibold" style={{ maxWidth: '10rem' }}>
                  {payload.appMeta.name}
                </Name>
              </div>
              <T
                id="appRequestsToSign"
                substitutions={[
                  <Name className="max-w-full text-xs italic" key="origin">
                    {payload.origin}
                  </Name>
                ]}
              />
            </div>
          )
        };
    }
  }, [payload.type, payload.origin, payload.appMeta.name, error]);

  const modifiedStorageLimitDisplayed = useMemo(
    () => payload.type === 'confirm_operations' && payload.opParams.length < 2,
    [payload]
  );

  const modifyFeeAndLimit = useMemo<ModifyFeeAndLimit>(
    () => ({
      totalFee: modifiedTotalFeeValue,
      onTotalFeeChange: v => setModifiedTotalFeeValue(v),
      storageLimit: modifiedStorageLimitDisplayed ? modifiedStorageLimitValue : null,
      onStorageLimitChange: v => setModifiedStorageLimitValue(v)
    }),
    [
      modifiedTotalFeeValue,
      setModifiedTotalFeeValue,
      modifiedStorageLimitValue,
      setModifiedStorageLimitValue,
      modifiedStorageLimitDisplayed
    ]
  );

  return (
    <CustomRpsContext.Provider value={payload.networkRpc}>
      <div
        className="relative bg-white rounded-md shadow-md overflow-y-auto flex flex-col"
        style={{
          width: 380,
          height: 610
        }}
      >
        <div className="flex flex-col items-center px-4 py-2">
          <SubTitle small className={payload.type === 'connect' ? 'mt-4 mb-6' : 'mt-4 mb-2'}>
            {content.title}
          </SubTitle>

          {payload.type === 'connect' && (
            <ConnectBanner type={payload.type} origin={payload.origin} appMeta={payload.appMeta} className="mb-4" />
          )}

          {content.want}

          {payload.type === 'connect' && (
            <T id="viewAccountAddressWarning">
              {message => <p className="mb-4 text-xs font-light text-center text-gray-700">{message}</p>}
            </T>
          )}

          {error ? (
            <Alert
              closable
              onClose={handleErrorAlertClose}
              type="error"
              title="Error"
              description={error?.message ?? t('smthWentWrong')}
              className="my-4"
              autoFocus
            />
          ) : (
            <>
              {payload.type !== 'connect' && connectedAccount && (
                <AccountBanner
                  account={connectedAccount}
                  networkRpc={payload.networkRpc}
                  labelIndent="sm"
                  className="w-full mb-4"
                />
              )}

              <NetworkBanner rpc={payload.networkRpc} narrow={payload.type === 'connect'} />
              <PayloadContent
                payload={payload}
                accountPkhToConnect={accountPkhToConnect}
                setAccountPkhToConnect={setAccountPkhToConnect}
                modifyFeeAndLimit={modifyFeeAndLimit}
              />
            </>
          )}
        </div>

        <div className="flex-1" />

        <div
          className={classNames('sticky bottom-0 w-full', 'bg-white shadow-md', 'flex items-stretch', 'px-4 pt-2 pb-4')}
        >
          <div className="w-1/2 pr-2">
            <FormSecondaryButton
              type="button"
              className="justify-center w-full"
              loading={declining}
              onClick={handleDeclineClick}
              testID={content.declineActionTestID}
            >
              {content.declineActionTitle}
            </FormSecondaryButton>
          </div>

          <div className="w-1/2 pl-2">
            <FormSubmitButton
              type="button"
              className="justify-center w-full"
              loading={confirming}
              onClick={handleConfirmClick}
              testID={content.confirmActionTestID}
            >
              {content.confirmActionTitle}
            </FormSubmitButton>
          </div>
        </div>

        {/*<ConfirmLedgerOverlay displayed={confirming && connectedAccount?.type === TempleAccountType.Ledger} />*/}
      </div>
    </CustomRpsContext.Provider>
  );
};

export default ConfirmDAppForm;