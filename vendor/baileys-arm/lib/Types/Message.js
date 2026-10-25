import { proto } from "../../WAProto/index.js";
const AssociationType = proto.MessageAssociation.AssociationType;
const ButtonHeaderType = proto.Message.ButtonsMessage.HeaderType;
const ButtonType = proto.Message.ButtonsMessage.Button.Type;
const CarouselCardType = proto.Message.InteractiveMessage.CarouselMessage.CarouselCardType;
const ListType = proto.Message.ListMessage.ListType;
const ProtocolType = proto.Message.ProtocolMessage.Type;
const WAMessageStubType = proto.WebMessageInfo.StubType;
const WAMessageStatus = proto.WebMessageInfo.Status;
var WAMessageAddressingMode;
(function(WAMessageAddressingMode2) {
  WAMessageAddressingMode2["PN"] = "pn";
  WAMessageAddressingMode2["LID"] = "lid";
})(WAMessageAddressingMode || (WAMessageAddressingMode = {}));
export {
  AssociationType,
  ButtonHeaderType,
  ButtonType,
  CarouselCardType,
  ListType,
  ProtocolType,
  WAMessageAddressingMode,
  WAMessageStatus,
  WAMessageStubType,
  proto as WAProto
};
