import {ButtonPrimary} from 'components/Button/Primary';
import LottieView from 'lottie-react-native';
import React, {FC, useEffect, useState, useRef, useCallback, useMemo} from 'react';
import {StyleSheet} from 'react-native';
import FastImage from 'react-native-fast-image';
import {Text} from 'react-native-paper';
import useEarn from 'scenes/earn/helper/useEarn';
import {
  IDataEarn,
  IReqCurrentEarn,
  IReqCurrentShop,
} from 'scenes/earn/redux/types';
import {locationSelector} from 'services/location/slice';
import {useAppSelector} from 'storeConfig/hook';
import Images from 'utils/Images';
import {resFont, resWidth} from 'utils/Screen';
import {COLORS, SPACING} from 'utils/styleGuide';
import CountDown from './CountDown';
import {useTranslation} from 'react-i18next';
import {useIsFocused} from '@react-navigation/native';
import InterstitialAdsService from 'components/Ads/InterstitialAds';
import AdsManager from 'manager/adsManager';
import moment from 'moment';

const styles = StyleSheet.create({
  btnStart: {
    backgroundColor: COLORS.shopGreen,
    borderWidth: 1,
    borderColor: COLORS.white,
    width: resWidth(234),
    height: resWidth(44),
    borderRadius: resWidth(10),
    marginBottom: SPACING.l_32,
  },
  errorMessage: {
    textAlign: 'center',
    color: COLORS.pastelYellow,
    fontFamily: 'Roboto',
    fontWeight: '700',
    fontSize: resFont(16),
    lineHeight: resWidth(18),
    paddingBottom: SPACING.l_32,
  },
  txtDisable: {
    color: COLORS.grey2,
  },
  txt: {
    fontWeight: '700',
    fontFamily: 'Roboto',
    fontSize: resFont(14),
    lineHeight: resWidth(16),
    color: COLORS.white,
  },
  warningEarn: {
    fontStyle: 'italic',
    fontFamily: 'Roboto',
    fontWeight: '700',
    lineHeight: resWidth(16),
    textAlign: 'center',
    fontSize: resFont(12),
    color: COLORS.white,
  },
  txtMakeDone: {
    fontFamily: 'Roboto',
    fontWeight: '700',
    fontSize: resWidth(20),
    lineHeight: resWidth(24),
    color: COLORS.white,
    textAlign: 'center',
  },
  img: {
    width: resWidth(224),
    height: resWidth(180),
  },
});
type EarnProps = {
  locationID: string;
  onSetDataEarn: (data: IReqCurrentEarn & {makeDone: boolean}) => void;
  propsEarn?: IDataEarn;
};
let stopCountDown = false;
const BtnStartEarn: FC<EarnProps> = ({
  locationID,
  onSetDataEarn,
  propsEarn,
}) => {
  const {t} = useTranslation();
  const {startEarn, verifyEarn, checkEarn, loading, dataEarn, errorMessage} =
    useEarn(propsEarn);
  const [finish, setFinish] = useState<boolean>(false);
  const [makeDone, setMakeDone] = useState<boolean>(false);
  const [isAdLoading, setIsAdLoading] = useState<boolean>(false);
  const [adShownCount, setAdShownCount] = useState<number>(0);
  const [totalCountdownTime, setTotalCountdownTime] = useState<number>(0);
  
  const currentLocation = useAppSelector(locationSelector.getCurentLocation);
  const isFocus = useIsFocused();
  
  // Refs for ad management
  const showingAdRef = useRef(false);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalTotalRef = useRef<number | null>(null);
  const earningEndedRef = useRef(false);

  // Check if ad evaluation should run
  const shouldEvaluateAds = useMemo(() => {
    return dataEarn?.countdownTime && dataEarn.countdownTime > 0 &&
      !finish && !makeDone &&
      adShownCount < 3 &&
      isFocus;
  }, [dataEarn?.countdownTime, finish, makeDone, adShownCount, isFocus]);

  useEffect(() => {
    // Ensure ads SDK is initialized before attempting to load/show
    AdsManager.initialize().catch(() => {});
    // Preload first interstitial
    InterstitialAdsService.load();
    
    return () => {
      // Cleanup ad state
      earningEndedRef.current = false;
      showingAdRef.current = false;
      setIsAdLoading(false);
      setAdShownCount(0);
      setTotalCountdownTime(0);
      originalTotalRef.current = null;
      
      // Clear interval if running
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
  }, []);

  const showCountdownAd = useCallback(async () => {
    if (showingAdRef.current || adShownCount >= 3 || !isFocus) {
      console.log(`Ad blocked: showing=${showingAdRef.current}, count=${adShownCount}/3, focused=${isFocus}`);
      return;
    }
    
    console.log(`Attempting to show countdown ad ${adShownCount + 1}/3...`);
    showingAdRef.current = true;
    setIsAdLoading(true);
  
    const cleanup = () => {
      console.log(`Cleaning up ad ${adShownCount + 1}`);
      setIsAdLoading(false);
      showingAdRef.current = false;
    };
  
    try {
      const loadTimeout = setTimeout(() => {
        console.log(`Ad ${adShownCount + 1} load timeout`);
        cleanup();
      }, 5000);
  
      InterstitialAdsService.load().onLoad(() => {
        clearTimeout(loadTimeout);
        
        if (!isFocus || earningEndedRef.current) {
          console.log(`Ad ${adShownCount + 1} load success but conditions changed: focused=${isFocus}, ended=${earningEndedRef.current}`);
          cleanup();
          return;
        }
        
        if (InterstitialAdsService.show()) {
          console.log(`Ad ${adShownCount + 1}/3 displayed successfully`);
          setAdShownCount(prev => prev + 1);
          
          InterstitialAdsService.onClose(() => {
            console.log(`Ad ${adShownCount + 1} closed`);
            cleanup();
            if (adShownCount + 1 < 3) {
              InterstitialAdsService.load();
            }
          });
        } else {
          console.log(`Ad ${adShownCount + 1} failed to show after load`);
          cleanup();
        }
      });
    } catch (error) {
      console.log(`Error during ad ${adShownCount + 1} load/show:`, error);
      cleanup();
    }
  }, [adShownCount, isFocus]);
  
  const evaluateAdTrigger = useCallback(() => {
    if (!shouldEvaluateAds || !dataEarn?.countdownTime) {
      return;
    }

    const endUnix = dataEarn.countdownTime;
    const secondsLeft = Math.max(0, moment.unix(endUnix).diff(moment(), 'seconds'));

    // Initialize the original total countdown once
    if (originalTotalRef.current === null) {
      // For earning, we'll use the current remaining time as total
      // since we don't have createdAt timestamp like in meetings
      if (secondsLeft > 0) {
        originalTotalRef.current = secondsLeft;
        console.log(`Earning: using current remaining time as total = ${originalTotalRef.current}s`);
      } else {
        // Last resort: use a default 5-minute countdown
        originalTotalRef.current = 300;
        console.log(`Earning: using default 5-minute countdown = ${originalTotalRef.current}s`);
      }
      
      if (totalCountdownTime === 0) {
        setTotalCountdownTime(originalTotalRef.current);
      }
    }

    const baseTotal = originalTotalRef.current ?? totalCountdownTime;
    const percentageRemaining = baseTotal > 0 ? (secondsLeft / baseTotal) * 100 : 0;

    // Show ads in order at wider ranges to avoid missing ticks
    let shouldShowAd = false;
    if (adShownCount === 0 && percentageRemaining <= 95 && percentageRemaining > 75) {
      shouldShowAd = true;
    } else if (adShownCount === 1 && percentageRemaining <= 65 && percentageRemaining > 35) {
      shouldShowAd = true;
    } else if (adShownCount === 2 && percentageRemaining <= 30 && percentageRemaining > 0) {
      shouldShowAd = true;
    }
    if (shouldShowAd && secondsLeft > 0) {
      console.log(`Earning: Showing ad ${adShownCount + 1}/3 at ${percentageRemaining.toFixed(1)}% remaining time (${secondsLeft}s left)`);
      showCountdownAd();
    }
  }, [shouldEvaluateAds, dataEarn?.countdownTime, totalCountdownTime, adShownCount, showCountdownAd]);

  // Manage ad evaluation interval
  useEffect(() => {
    if (shouldEvaluateAds && !tickIntervalRef.current) {
      tickIntervalRef.current = setInterval(evaluateAdTrigger, 1000);
      console.log('Started earning ad evaluation interval');
    } else if (!shouldEvaluateAds && tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
      console.log('Stopped earning ad evaluation interval');
    }

    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
        console.log('Cleaned up earning ad evaluation interval');
      }
    };
  }, [shouldEvaluateAds, evaluateAdTrigger]);

  useEffect(() => {
    const payload = {
      earnID: dataEarn?.earnID || '',
      currentLat: currentLocation?.latitude || 0,
      currentLong: currentLocation?.longitude || 0,
      makeDone,
    };
    onSetDataEarn(payload);
  }, [dataEarn?.countdownTime]);

  useEffect(() => {
    if (dataEarn && dataEarn?.countdownTime > 0) {
      let payload: IReqCurrentEarn = {
        earnID: dataEarn?.earnID || '',
        currentLat: currentLocation?.latitude || 0,
        currentLong: currentLocation?.longitude || 0,
        // currentLat: 10.729877175074606,
        // currentLong: 106.62474381431971,
      };
      const interval = setInterval(() => {
        if (stopCountDown) {
          clearInterval(interval);
        } else {
          checkEarn(payload);
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [dataEarn?.countdownTime]);
  
  const onStart = () => {
    if (currentLocation) {
      const payload: IReqCurrentShop = {
        locationID,
        currentLat: currentLocation?.latitude,
        currentLong: currentLocation?.longitude,
      };
      startEarn(payload);
    }
  };

  const onDone = async () => {
    if (currentLocation) {
      const payload: IReqCurrentEarn = {
        earnID: dataEarn?.earnID || '',
        currentLat: currentLocation?.latitude,
        currentLong: currentLocation?.longitude,
      };
      const status = await verifyEarn(payload);
      setMakeDone(status);
      earningEndedRef.current = true;
      onSetDataEarn({...payload, makeDone: true});
    }
  };
  
  const disableButton =
    loading || (dataEarn && dataEarn?.countdownTime > 0 && !finish);
  const styleBtn = styles.btnStart;
  const txtBtn = disableButton
    ? StyleSheet.flatten([styles.txt, styles.txtDisable])
    : styles.txt;

  const onRenderErrorMessage = () => {
    if (errorMessage)
      return <Text style={styles.errorMessage}>{errorMessage}</Text>;
    return null;
  };

  const onCountDownSuccess = () => {
    stopCountDown = true;
    setFinish(true);
    earningEndedRef.current = true;
  };
  
  const titleEarn =
    dataEarn && dataEarn.countdownTime
      ? t('earn.finishButton')
      : t('earn.startButton');
  const warningEarn =
    dataEarn && dataEarn.countdownTime
      ? t('earn.finishWarning')
      : '';
  const congratSuccess = t('earn.successMessage');
  const onActionEarn = !finish ? onStart : onDone;
  
  return (
    <>
      {makeDone ? (
        <>
          <Text style={styles.txtMakeDone}>{congratSuccess}</Text>
          <LottieView
            source={Images.animation.earnSuccess}
            loop
            autoPlay
            style={{width: resWidth(220), aspectRatio: 1}}
          />
        </>
      ) : (
        <>
          {dataEarn?.countdownTime && (
            <CountDown
              timeStamp={dataEarn?.countdownTime}
              onCountDownSuccess={onCountDownSuccess}
            />
          )}
          {onRenderErrorMessage()}
          <ButtonPrimary
            onPress={onActionEarn}
            disabled={disableButton}
            containerStyle={styleBtn}
            titleStyle={txtBtn}
            content={titleEarn}
          />
          {finish && <Text style={styles.warningEarn}>{warningEarn} </Text>}
        </>
      )}
      {!dataEarn?.countdownTime && (
        <FastImage
          source={Images.earn.background}
          resizeMode="contain"
          style={styles.img}
        />
      )}
    </>
  );
};
export default BtnStartEarn;
