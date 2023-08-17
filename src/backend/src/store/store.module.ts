import { Module } from '@nestjs/common';
import { ChatMessageStoreService } from './store.message.service';
import { ChatUserStoreService } from './store.user.service';
import { ChatRoomStoreService } from './store.room.service';
import { GameMatchStoreService } from './store.match.service';

//사용이 좀 이상한 것 같지만...!
@Module({
	providers : [
		ChatMessageStoreService,
		ChatUserStoreService,
		ChatRoomStoreService,
		GameMatchStoreService
	],
	exports : [
		ChatMessageStoreService,
		ChatUserStoreService,
		ChatRoomStoreService
	]
})
export class StoreModule {}
