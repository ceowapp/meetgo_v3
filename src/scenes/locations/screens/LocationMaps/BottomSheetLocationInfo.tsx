import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {EStatusLocation, LocationInfo} from 'scenes/locations/redux/type';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetBackgroundProps,
  BottomSheetView,
  useBottomSheetDynamicSnapPoints,
} from '@gorhom/bottom-sheet';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Screen, {perHeight, resFont, resWidth} from 'utils/Screen';
import {getSoftMenuBarHeight} from 'react-native-extra-dimensions-android';
import Platform from 'utils/Platform';
import {calculatePercentMeet, openMapApp} from 'utils/Utility';
import {Animated, StyleSheet, TouchableOpacity, View} from 'react-native';
import {COLORS, SPACING} from 'utils/styleGuide';
import IconLocation from './IconLocation';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Text} from 'react-native-paper';
import {ButtonPrimary} from 'components/Button/Primary';
import FastImage from 'react-native-fast-image';
import {ProgressiveImage} from 'components/Image/ProgressiveImage';
import LinearGradient from 'react-native-linear-gradient';
import {interpolateColor, useAnimatedStyle} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

type IPropsLocationInfo = {
  dataSelectedLocation: LocationInfo | null;
  onNavigateLocationDetail: () => void;
  onNavigateEarning: () => void;
};
enum EBottomValue {
  CLOSE = -1,
  OPEN = 0,
}

const BottomSheetLocationInfo: FC<IPropsLocationInfo> = ({
  dataSelectedLocation,
  onNavigateLocationDetail,
  onNavigateEarning,
}) => {
  const { t } = useTranslation();
  const [index, setIndex] = useState(EBottomValue.CLOSE);

  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['50%'], []);

  useEffect(() => {
    if (dataSelectedLocation) {
      setIndex(EBottomValue.OPEN);
    }
  }, [dataSelectedLocation]);

  const onOpenMap = () => {
    if (dataSelectedLocation) {
      openMapApp(dataSelectedLocation.latitude, dataSelectedLocation.longitude);
    }
  };

  const onClose = useCallback(() => {
    setIndex(EBottomValue.CLOSE);
  }, []);

  const renderBackdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
  );

  // const renderImageLocation = () => {
  //   if (!dataSelectedLocation?.imageShopLocation) return <></>;
  //   return (
  //     <ProgressiveImage
  //       source={{
  //         uri: dataSelectedLocation?.imageShopLocation,
  //       }}
  //       resizeMode="cover"
  //       style={styles.img}
  //     />
  //   );
  // };

  // const {
  //   animatedHandleHeight,
  //   animatedSnapPoints,
  //   animatedContentHeight,
  //   handleContentLayout,
  // } = useBottomSheetDynamicSnapPoints(snapPoints);
  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={index}
      enableDynamicSizing
      enableOverDrag
      snapPoints={snapPoints}
      handleStyle={styles.handleStyle}
      handleIndicatorStyle={styles.handleIndicator}
      // backgroundComponent={CustomBackground}
      // handleHeight={animatedHandleHeight}
      // contentHeight={animatedContentHeight}
      backdropComponent={renderBackdrop}
      onClose={onClose}>
      <LinearGradient
        {...Screen.linearBackground}
        start={{x: 0, y: 0}}
        end={{x: 0.1, y: 1.1}}
        style={styles.container}>
        <BottomSheetView
          // onLayout={handleContentLayout}
          style={styles.bottomContainer}>
          {/* {renderImageLocation()} */}
          <View style={styles.addressContainer}>
            {dataSelectedLocation?.statusLocation ? (
              <IconLocation
                statusLocation={dataSelectedLocation.statusLocation}
              />
            ) : (
              <Icon name="pin" color={COLORS.white} size={SPACING.m_16} />
            )}
            <View style={styles.addressItem}>
              <Text style={styles.txtAddress} numberOfLines={2}>
                {dataSelectedLocation?.address}
              </Text>
              <View style={styles.containProperties}>
                <View style={styles.distanceContainer}>
                  <Icon
                    name="map-marker-outline"
                    size={SPACING.m_16}
                    color={COLORS.white}
                  />
                  <Text style={styles.txtProperties}>
                    {dataSelectedLocation?.distanceInKm ?? 'N/A'} km
                  </Text>
                </View>
                <View style={{width: SPACING.l_32}} />
                <View style={styles.distanceContainer}>
                  <Icon
                    name="gift-outline"
                    size={SPACING.m_16}
                    color={COLORS.white}
                  />
                  <View style={{width: SPACING.s_4}} />
                  <Text style={styles.txtProperties}>
                    {dataSelectedLocation?.totalOfMeet
                      ? calculatePercentMeet(dataSelectedLocation.totalOfMeet)
                      : 0}
                    %
                  </Text>
                </View>
                <View style={{width: SPACING.l_32}} />
                {dataSelectedLocation &&
                  dataSelectedLocation.statusLocation ===
                    EStatusLocation.SHOP && (
                    <View style={styles.distanceContainer}>
                      <Icon
                        name="cash"
                        size={SPACING.m_16}
                        color={COLORS.white}
                      />
                      <View style={{width: SPACING.s_4}} />
                      <Text style={styles.txtProperties}>
                        {dataSelectedLocation?.totalOfMeet
                          ? calculatePercentMeet(
                              dataSelectedLocation.totalOfEarn,
                            )
                          : 0}
                        %
                      </Text>
                    </View>
                  )}
              </View>
              <TouchableOpacity onPress={onNavigateLocationDetail}>
                <Text style={styles.txtDetail}>{t('location.details_link')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.bottomBtnContainer}>
            <ButtonPrimary
              type="tiny"
              onPress={onOpenMap}
              containerStyle={styles.btnDirection}
              content={<Text style={styles.txtBtn} numberOfLines={1}>{t('location.direction_button')}</Text>}
            />
            <View style={styles.w16} />
            {dataSelectedLocation &&
              dataSelectedLocation.statusLocation === EStatusLocation.SHOP && (
                <>
                  <View style={styles.w16} />
                  <ButtonPrimary
                    type="tiny"
                    containerStyle={styles.btnEarn}
                    onPress={onNavigateEarning}
                    content={<Text style={styles.txtBtn} numberOfLines={1}>{t('location.earning_button')}</Text>}
                  />
                </>
              )}
          </View>
        </BottomSheetView>
      </LinearGradient>
    </BottomSheet>
  );
};

export default BottomSheetLocationInfo;
const styles = StyleSheet.create({
  container: {flex: 1, borderRadius: 10},
  bottomContainer: {
    padding: resWidth(20),
    paddingBottom: resWidth(24)
  },
  handleStyle: {
    position: 'absolute',
    width: '100%',
  },
  handleIndicator: {
    backgroundColor: '#E5E5E5',
    width: resWidth(40),
    height: 2,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: resWidth(12),
  },
  addressItem: {
    flex: 1,
    paddingLeft: SPACING.m_16,
    justifyContent: 'space-between',
  },
  bottomBtnContainer: {
    flexDirection: 'row',
    flex: 1,
    paddingTop: resWidth(16),
    paddingHorizontal: resWidth(4),
    justifyContent: 'space-between'
  },
  btnDirection: {
    paddingHorizontal: SPACING.s_12,
    paddingVertical: SPACING.s_10,
    flex: 1,
    minHeight: resWidth(44),
    maxHeight: resWidth(50),
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnEarn: {
    paddingHorizontal: SPACING.s_12,
    paddingVertical: SPACING.s_10,
    flex: 1,
    minHeight: resWidth(44),
    maxHeight: resWidth(50),    
    backgroundColor: COLORS.green,
    borderWidth: 1,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center'
  },
  distanceContainer: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    minWidth: resWidth(60)
  },
  containProperties: {
    paddingHorizontal: SPACING.s_4,
    paddingVertical: SPACING.s_8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  txtProperties: {
    fontFamily: 'Roboto',
    fontWeight: '400',
    fontSize: resFont(11),
    lineHeight: resWidth(14),
    color: COLORS.white,
  },
  txtBtn: {
    fontFamily: 'Roboto',
    fontWeight: '700',
    fontSize: resFont(11),
    lineHeight: resWidth(14),
    color: COLORS.white,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  txtAddress: {
    fontFamily: 'Roboto-Bold',
    fontWeight: '700',
    fontSize: resFont(13),
    lineHeight: resWidth(16),
    color: COLORS.white,
    marginBottom: resWidth(8),
    marginTop: resWidth(8)
  },
  txtDetail: {
    fontFamily: 'Roboto',
    fontStyle: 'italic',
    fontSize: resFont(11),
    lineHeight: resWidth(14),
    color: COLORS.white,
    textDecorationLine: 'underline',
  },
  w16: {
    width: SPACING.s_12,
  },
});
