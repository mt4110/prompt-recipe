use crate::{application, domain::*};
use rusqlite::Connection;
use std::{
    path::Path,
    sync::mpsc::{sync_channel, SyncSender},
};

type Job = Box<dyn FnOnce(&mut Connection) + Send>;
#[derive(Clone)]
pub struct Store {
    sender: SyncSender<Job>,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let mut connection = Connection::open(path).map_err(application::storage_error)?;
        application::initialize(&mut connection)?;
        let (sender, receiver) = sync_channel::<Job>(32);
        std::thread::Builder::new()
            .name("recipe-store".into())
            .spawn(move || {
                while let Ok(job) = receiver.recv() {
                    job(&mut connection);
                }
            })
            .map_err(|_| Error::new("worker", "保存処理を開始できません。"))?;
        Ok(Self { sender })
    }
    pub fn call<T: Send + 'static>(
        &self,
        work: impl FnOnce(&mut Connection) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let (tx, rx) = sync_channel(1);
        self.sender
            .try_send(Box::new(move |conn| {
                let _ = tx.send(work(conn));
            }))
            .map_err(|_| {
                Error::new(
                    "busy",
                    "保存処理が混み合っています。少し待って再試行してください。",
                )
            })?;
        rx.recv()
            .map_err(|_| Error::new("worker", "保存処理が停止しました。入力を保持してください。"))?
    }
}
