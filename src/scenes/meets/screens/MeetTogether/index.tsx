import {
  RouteProp,
  useIsFocused,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import CommonHeader from 'components/CommonHeader';
import Container from 'components/Container';
import LottieView from 'lottie-react-native';
import {AppStackParamList} from 'navigation/types';
import React, {useEffect, useRef, useState, useCallback, useMemo} from 'react';
import {StyleSheet, View, TouchableOpacity} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Text} from 'react-native-paper';
import {useKeepAwake} from '@sayem314/react-native-keep-awake';
import {AccountSelector} from 'scenes/account/redux/slice';
import {useAppSelector} from 'storeConfig/hook';
import Images from 'utils/Images';
import Screen, {perWidth, resFont, resWidth} from 'utils/Screen';
import {COLORS, SPACING} from 'utils/styleGuide';
import CircleAvatar from './CircleAvatar';
import database from '@react-native-firebase/database';
import {AuthSelector} from 'scenes/auth/redux/slice';
import {isEmpty} from 'lodash';
import {IDataListenMeet} from './types';
import {IStatusMeet} from 'constant/commonType';
import CountDown from './CountDown';
import {useMeet} from 'scenes/meets/helper/useMeet';
import {hideModal, showDialogModal} from 'services/globalModal/modalHandler';
import WarningDialog from './WarningDialog';
import useToast from 'components/Toast/useToast';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {calculatePercentMeet} from 'utils/Utility';
import moment from 'moment';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ProgressiveImage} from 'components/Image/ProgressiveImage';
import { useTranslation } from 'react-i18next';
import InterstitialAdsService from 'components/Ads/InterstitialAds';
import AdsManager from 'manager/adsManager';

const styles = StyleSheet.create({
  header: {
    alignItems: 'flex-end',
    paddingBottom: SPACING.m_16,
  },
});

const MeetTogether = () => {
  useKeepAwake();
  const { t } = useTranslation();
  const myAvatar = useAppSelector(AccountSelector.getAvatar);
  const account = useAppSelector(AuthSelector.getAccount);
  const navigation = useNavigation();
  const {addToast} = useToast();
  const {sendPendingSuccess, confimEndMeeting} = useMeet();
  const {top} = useSafeAreaInsets();
  const [dataConnect, setDataConnect] = useState<IDataListenMeet>();
  const [finishMeet, setFinishMeet] = useState<boolean>(false);
  const [isAdLoading, setIsAdLoading] = useState<boolean>(false);
  const [adShownCount, setAdShownCount] = useState<number>(0);
  const [totalCountdownTime, setTotalCountdownTime] = useState<number>(0);
  
  // Refs for cleanup and state management
  const isConfirmBackRef = useRef(false);
  const meetingEndedRef = useRef(false);
  const showingAdRef = useRef(false);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalTotalRef = useRef<number | null>(null);
  
  const {params} = useRoute<RouteProp<AppStackParamList, 'CONNECT_TOGETHER'>>();
  const {connectId} = params || {};
  const isFocus = useIsFocused();

  // Memoized computed values to prevent unnecessary recalculations
  const avatarMeeter = useMemo(() => {
    if (!dataConnect) return undefined;
    return account === dataConnect.accountInvite
      ? dataConnect.imageAccountInvited
      : dataConnect.imageAccountInvite;
  }, [dataConnect, account]);

  const nameMeeter = useMemo(() => {
    if (!dataConnect) return '';
    return account === dataConnect.accountInvite
      ? `${dataConnect.firstnameAccountInvited} ${dataConnect.lastnameAccountInvited}`
      : `${dataConnect.firstnameAccountInvite} ${dataConnect.lastnameAccountInvite}`;
  }, [dataConnect, account]);

  // Check if ad evaluation should run
  const shouldEvaluateAds = useMemo(() => {
    return dataConnect?.statusMeet === IStatusMeet.READY &&
      (dataConnect?.countdownTime ?? 0) > 0 &&
      !finishMeet &&
      adShownCount < 3 &&
      isFocus;
  }, [dataConnect?.statusMeet, dataConnect?.countdownTime, finishMeet, adShownCount, isFocus]);

  useEffect(() => {
    // Ensure ads SDK is initialized before attempting to load/show
    AdsManager.initialize().catch(() => {});
    // Preload first interstitial
    InterstitialAdsService.load();
    
    return () => {
      // Cleanup all refs and state
      meetingEndedRef.current = false;
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
        
        if (!isFocus || meetingEndedRef.current) {
          console.log(`Ad ${adShownCount + 1} load success but conditions changed: focused=${isFocus}, ended=${meetingEndedRef.current}`);
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
    if (!shouldEvaluateAds || !dataConnect?.countdownTime) {
      return;
    }

    const endUnix = dataConnect.countdownTime;
    const secondsLeft = Math.max(0, moment.unix(endUnix).diff(moment(), 'seconds'));

    // Initialize the original total countdown once using server timestamps when available
    if (originalTotalRef.current === null) {
      const createdAt = dataConnect?.createdAtTimestamp ?? 0;
      
      // More robust timestamp calculation with fallbacks
      if (createdAt > 0 && endUnix > createdAt) {
        originalTotalRef.current = endUnix - createdAt;
        console.log(`Using server timestamps: total time = ${originalTotalRef.current}s`);
      } else if (secondsLeft > 0) {
        // Fallback: use current remaining time as total (this will be approximate)
        originalTotalRef.current = secondsLeft;
        console.log(`Fallback: using current remaining time as total = ${originalTotalRef.current}s`);
      } else {
        // Last resort: use a default 5-minute countdown
        originalTotalRef.current = 300;
        console.log(`Last resort: using default 5-minute countdown = ${originalTotalRef.current}s`);
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
      console.log(`Showing ad ${adShownCount + 1}/3 at ${percentageRemaining.toFixed(1)}% remaining time (${secondsLeft}s left)`);
      showCountdownAd();
    }
  }, [shouldEvaluateAds, dataConnect?.countdownTime, dataConnect?.createdAtTimestamp, totalCountdownTime, adShownCount, showCountdownAd]);

  // Manage ad evaluation interval
  useEffect(() => {
    if (shouldEvaluateAds && !tickIntervalRef.current) {
      tickIntervalRef.current = setInterval(evaluateAdTrigger, 1000);
      console.log('Started ad evaluation interval');
    } else if (!shouldEvaluateAds && tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
      console.log('Stopped ad evaluation interval');
    }

    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
        console.log('Cleaned up ad evaluation interval');
      }
    };
  }, [shouldEvaluateAds, evaluateAdTrigger]);

  // Firebase listener with proper cleanup
  useEffect(() => {
    const meetingPath = `Meeting/${account}/history/${connectId}`;
    const reference = database().ref(meetingPath);
    reference.on('value', snapShot => {
      if (snapShot.exists() && !isEmpty(snapShot.val())) {
        setDataConnect(snapShot.val());
      }
    });
  }, [connectId]);

  // Check if meeting has ended
  useEffect(() => {
    // check current countdown when user leave app along time
    if (dataConnect && dataConnect?.countdownTime > 0) {
      const timeCountDown = moment.unix(dataConnect?.countdownTime).toString();
      const currentDateCountDown = new Date(timeCountDown);
      if (currentDateCountDown < new Date()) {
        isConfirmBackRef.current = true;
        setFinishMeet(true);
      }
    }
  }, [isFocus, dataConnect]);

  // Navigation listener with proper cleanup
  useEffect(() => {
    navigation.addListener('beforeRemove', e => {
      if (!isConfirmBackRef.current) {
        onWarningBack();
        e.preventDefault();
      } else {
        navigation.dispatch(e.data.action);
        hideModal();
      }
    });
  }, [finishMeet, navigation, isConfirmBackRef]);

  // Handle meeting rejection
  useEffect(() => {
    if (
      dataConnect?.statusMeet === IStatusMeet.INVITED_REJECT ||
      dataConnect?.statusMeet === IStatusMeet.INVITE_REJECT
    ) {
      onFinishBack();
    }
  }, [dataConnect?.statusMeet]);

  const onCountDownSuccess = useCallback(() => {
    meetingEndedRef.current = true;
    setFinishMeet(true);
    isConfirmBackRef.current = true;
    sendPendingSuccess({connectId, account});
  }, [connectId, account, sendPendingSuccess]);

  const onFinishBack = useCallback(async () => {
    isConfirmBackRef.current = true;
    meetingEndedRef.current = true;
    await onConfirmEndMeeting();
    navigation.goBack();
  }, [navigation]);

  const onContinue = useCallback(() => {
    try {
      hideModal();
    } catch (error) {
      // Modal might not be open, ignore error
    }
  }, []);
  
  const onWarningBack = useCallback(() => {
    showDialogModal({
      content: () => (
        <WarningDialog
          onContinue={onContinue}
          onExit={onFinishBack}
          title={t('meets.warning_exit_title')}
          description={t('meets.warning_exit_description')}
        />
      ),
    });
  }, [onContinue, onFinishBack, t]);

  const onConfirmEndMeeting = useCallback(async () => {
    try {
      const isResult = await confimEndMeeting({connectId, account});
      if (!isResult) {
        addToast({
          message: t('meets.error_end_meeting'),
          type: 'ERROR_V3',
          position: 'top',
        });
      }
      return isResult;
    } catch (error) {
      console.error('Error ending meeting:', error);
      addToast({
        message: t('meets.error_end_meeting'),
        type: 'ERROR_V3',
        position: 'top',
      });
      return false;
    }
  }, [connectId, account, confimEndMeeting, addToast, t]);

  const bottomContent = useCallback(() => {
    if (finishMeet) {
      const subContent = t('meets.note_final_result');
      return (
        <Text
          style={{
            color: COLORS.white,
            textAlign: 'center',
            fontStyle: 'italic',
          }}>
          {subContent}
        </Text>
      );
    }
    
    if (dataConnect?.statusMeet === IStatusMeet.READY) {
      return (
        <View
          style={{
            padding: SPACING.m_16,
          }}>
          <Text
            style={{
              fontFamily: 'Roboto',
              fontSize: resFont(20),
              fontWeight: '700',
              color: COLORS.white,
              textAlign: 'center',
              fontStyle: 'italic',
            }}>
            {t('meets.advice_quality_meet')}
          </Text>
        </View>
      );
    }
    return null;
  }, [finishMeet, dataConnect?.statusMeet, t]);

  const animateByState = useCallback(() => {
    return (
      <ProgressiveImage
        source={Images.meet.meetTogether}
        resizeMode="contain"
        style={{width: perWidth(50), aspectRatio: 1}}
      />
    );
  }, []);

  const renderHeader = useCallback(() => {
    const actionBack = finishMeet ? onFinishBack : onWarningBack;
    return (
      <CommonHeader
        title={t('meets.connect_meet')}
        onPressBtnDefaultLeft={actionBack}
        containerStyle={[
          styles.header,
          {
            height: top + resWidth(44),
          },
        ]}
      />
    );
  }, [finishMeet, onFinishBack, onWarningBack, t, top]);

  const renderMessageMeetSuccess = useCallback(() => {
    const content = t('meets.congratulations');
    return (
      <Text
        variant="titleMedium"
        style={{
          textAlign: 'center',
          color: COLORS.white,
          paddingBottom: SPACING.m_16,
        }}>
        {content}
      </Text>
    );
  }, [t]);

  const renderNFTAddress = useCallback(() => (
    <View
      style={{
        alignItems: 'center',
        marginVertical: SPACING.s_8,
        padding: SPACING.s_12,
        borderRadius: SPACING.s_6,
      }}>
      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        <Icon name="map-marker" size={SPACING.l_24} color={COLORS.white} />
        <Text style={{color: COLORS.white, textAlign: 'center'}}>
          Meet Location
        </Text>
      </View>
      <Text
        numberOfLines={2}
        style={{color: COLORS.white, textAlign: 'center'}}>
        {dataConnect?.address}
      </Text>
      <Text
        numberOfLines={2}
        style={{
          color: COLORS.white,
          textAlign: 'center',
          paddingTop: SPACING.s_6,
        }}>
        {t('meets.meeting_percent')}{' '}
        {dataConnect && dataConnect.totalOfMeet
          ? calculatePercentMeet(dataConnect.totalOfMeet)
          : 0}
        %
      </Text>
    </View>
  ), [dataConnect?.address, dataConnect?.totalOfMeet, t]);

    const renderCountDownTime = useCallback(() => {
    if (
      dataConnect?.statusMeet === IStatusMeet.READY &&
      dataConnect.countdownTime > 0 &&
      !finishMeet
    ) {
      return (
        <CountDown
          timeStamp={dataConnect.countdownTime}
          onCountDownSuccess={onCountDownSuccess}
        />
      );
    } else if (dataConnect?.statusMeet === IStatusMeet.PENDING) {
      return (
        <View style={{flex: 1, alignItems: 'center'}}>
          <LottieView
            loop
            autoPlay
            source={Images.animation.waitingTime}
            style={{width: perWidth(20), aspectRatio: 1}}
          />
        </View>
      );
    } else if (
      dataConnect?.statusMeet === IStatusMeet.PENDING_SUCCESS ||
      finishMeet
    ) {
      return (
        <LottieView
          loop={true}
          autoPlay
          source={Images.animation.success}
          style={{width: perWidth(25), aspectRatio: 1}}
        />
      );
    }
    return null;
  }, [dataConnect?.statusMeet, dataConnect?.countdownTime, finishMeet, onCountDownSuccess]);

  return (
    <LinearGradient {...Screen.linearBackground} style={{flex: 1}}>
      <Container edges={['bottom']}>
        {renderHeader()}
        <View style={{alignItems: 'center', padding: SPACING.l_24}}>
          {(dataConnect?.statusMeet === IStatusMeet.PENDING_SUCCESS ||
            finishMeet) &&
            renderMessageMeetSuccess()}
          <View
            style={{
              flexDirection: 'row',
              width: '100%',
              justifyContent: 'space-between',
            }}>
            <CircleAvatar url={myAvatar} />
            {renderCountDownTime()}
            <CircleAvatar url={avatarMeeter} />
          </View>
          {renderNFTAddress()}
          {animateByState()}
          {bottomContent()}
        </View>
      </Container>
    </LinearGradient>
  );
};

export default MeetTogether;
